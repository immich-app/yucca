package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"

	"fubar/internal/api"
	"fubar/internal/config"
	"fubar/internal/keychain"
	"fubar/internal/restic"
	"fubar/internal/ui"
)

// planLock is a per-plan single-flight guard (crash-safe: a lock whose pid is
// gone is stale and reclaimed).
func planLock(name string) (release func(), err error) {
	dir, err := config.Dir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(dir, "locks"), 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "locks", name+".lock")

	for range 2 {
		f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			fmt.Fprintf(f, "%d", os.Getpid())
			f.Close()
			return func() { _ = os.Remove(path) }, nil
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil, fmt.Errorf("plan %q is locked (%s)", name, path)
		}
		pid, _ := strconv.Atoi(string(data))
		if pid > 0 {
			if proc, findErr := os.FindProcess(pid); findErr == nil && proc.Signal(syscall.Signal(0)) == nil {
				return nil, fmt.Errorf("plan %q is already running (pid %d)", name, pid)
			}
		}
		// Stale lock from a dead process — reclaim.
		_ = os.Remove(path)
	}
	return nil, fmt.Errorf("plan %q is locked (%s)", name, path)
}

// runDeps carries what a plan run needs; progress goes to Out unless JSON.
type runDeps struct {
	Client *api.Client
	Bin    string
	Out    io.Writer
	JSON   bool
}

type runResult struct {
	Plan       string `json:"plan"`
	SnapshotID string `json:"snapshotId"`
	AddedBytes int64  `json:"addedBytes"`
	TotalBytes int64  `json:"totalBytes"`
	DurationMS int64  `json:"durationMs"`
	SizeBytes  int64  `json:"sizeBytes"`
}

// runPlan executes one backup run: fresh restic URL (never persisted),
// telemetry around the run, live progress, retention on success, and a state
// record for `fubar status`.
func runPlan(ctx context.Context, deps runDeps, plan *config.Plan) (*runResult, error) {
	release, err := planLock(plan.Name)
	if err != nil {
		return nil, err
	}
	defer release()

	password, err := keychain.Load(plan.Repository)
	if err != nil {
		return nil, err
	}
	repoURL, err := deps.Client.ResticURL(ctx, plan.Repository)
	if err != nil {
		return nil, fmt.Errorf("mint repository credentials: %w", err)
	}

	r := &restic.Restic{Bin: deps.Bin, Repo: repoURL, Password: password}

	start := time.Now()
	if err := deps.Client.SubmitBackupStart(ctx, plan.Repository); err != nil {
		log.Warn().Err(err).Msg("failed to submit backup-start telemetry")
	}

	var onStatus func(map[string]any)
	if !deps.JSON && deps.Out != nil {
		onStatus = func(msg map[string]any) {
			if restic.Str(msg, "message_type") != "status" {
				return
			}
			percent := restic.Num(msg, "percent_done")
			done := int64(restic.Num(msg, "bytes_done"))
			total := int64(restic.Num(msg, "total_bytes"))
			fmt.Fprintf(deps.Out, "%s  %s  %s / %s",
				ui.ClearLine, ui.ProgressBar(percent, 30), ui.Bytes(done), ui.Bytes(total))
		}
	}

	summary, backupErr := r.Backup(ctx, plan.Paths, plan.Excludes, "fubar:"+plan.Name, onStatus)
	duration := time.Since(start)
	if !deps.JSON && deps.Out != nil {
		fmt.Fprint(deps.Out, ui.ClearLine)
	}

	if err := deps.Client.SubmitBackupEnd(ctx, plan.Repository, backupErr == nil, duration); err != nil {
		log.Warn().Err(err).Msg("failed to submit backup-end telemetry")
	}

	record := config.RunRecord{Start: start, End: time.Now(), Success: backupErr == nil}
	if backupErr != nil {
		record.Error = backupErr.Error()
		if stateErr := config.RecordRun(plan.Name, record); stateErr != nil {
			log.Warn().Err(stateErr).Msg("failed to record run state")
		}
		logErr := deps.Client.SubmitStructuredLog(ctx, "fubar backup failed", map[string]any{
			"plan": plan.Name, "repositoryId": plan.Repository, "error": backupErr.Error(),
		})
		if logErr != nil {
			log.Warn().Err(logErr).Msg("failed to submit structured log")
		}
		return nil, backupErr
	}

	record.SnapshotID = summary.SnapshotID
	record.AddedBytes = summary.DataAddedBytes
	if err := config.RecordRun(plan.Name, record); err != nil {
		log.Warn().Err(err).Msg("failed to record run state")
	}

	// Retention after a successful backup, then report the resulting size.
	if plan.HasRetention() {
		if err := r.Forget(ctx, plan.ForgetArgs()); err != nil {
			log.Warn().Err(err).Msg("retention (forget --prune) failed")
		}
	}

	result := &runResult{
		Plan:       plan.Name,
		SnapshotID: summary.SnapshotID,
		AddedBytes: summary.DataAddedBytes,
		TotalBytes: summary.TotalBytes,
		DurationMS: duration.Milliseconds(),
	}

	if size, err := r.Stats(ctx); err == nil {
		result.SizeBytes = size
		if err := deps.Client.SubmitRepositorySize(ctx, plan.Repository, size); err != nil {
			log.Warn().Err(err).Msg("failed to submit repository size")
		}
	} else {
		log.Warn().Err(err).Msg("failed to read repository stats")
	}

	logErr := deps.Client.SubmitStructuredLog(ctx, "fubar backup succeeded", map[string]any{
		"plan": plan.Name, "repositoryId": plan.Repository, "snapshotId": summary.SnapshotID,
		"addedBytes": summary.DataAddedBytes, "durationMs": duration.Milliseconds(),
	})
	if logErr != nil {
		log.Warn().Err(logErr).Msg("failed to submit structured log")
	}

	return result, nil
}

// RunPlanResult is the exported shape of a run, for integration tests.
type RunPlanResult struct {
	SnapshotID string
	AddedBytes int64
}

// RunPlanForTest executes a plan run with an already-built API client. Exported
// only so the package-main integration test can drive a real backup.
func RunPlanForTest(ctx context.Context, client *api.Client, bin string, plan *config.Plan) (*RunPlanResult, error) {
	result, err := runPlan(ctx, runDeps{Client: client, Bin: bin, JSON: true}, plan)
	if err != nil {
		return nil, err
	}
	return &RunPlanResult{SnapshotID: result.SnapshotID, AddedBytes: result.AddedBytes}, nil
}

// resticFor builds a restic handle for ad-hoc commands (snapshots/restore/…).
func resticFor(ctx context.Context, deps runDeps, plan *config.Plan) (*restic.Restic, error) {
	password, err := keychain.Load(plan.Repository)
	if err != nil {
		return nil, err
	}
	repoURL, err := deps.Client.ResticURL(ctx, plan.Repository)
	if err != nil {
		return nil, fmt.Errorf("mint repository credentials: %w", err)
	}
	return &restic.Restic{Bin: deps.Bin, Repo: repoURL, Password: password}, nil
}

// selectPlans returns the named plan, or all plans when name is empty.
func selectPlans(cfg *config.Config, name string) ([]*config.Plan, error) {
	if name != "" {
		plan, err := cfg.Plan(name)
		if err != nil {
			return nil, err
		}
		return []*config.Plan{plan}, nil
	}
	if len(cfg.Plans) == 0 {
		return nil, errors.New("no plans configured — create one with `fubar init`")
	}
	plans := make([]*config.Plan, 0, len(cfg.Plans))
	for i := range cfg.Plans {
		plans = append(plans, &cfg.Plans[i])
	}
	return plans, nil
}

// printJSON renders v as JSON on stdout (the --json contract).
func printJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
