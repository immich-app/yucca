package restic

// The restic driver, adapted from yuctl's internal/bench/restic.go: credentials
// travel via the child's environment, never argv; --json output is streamed
// line-by-line so callers can render live progress.

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Restic wraps the restic binary against one repository.
type Restic struct {
	Bin      string
	Repo     string
	Password string
}

func cacheDir() string {
	base, err := os.UserCacheDir()
	if err != nil {
		return ""
	}
	return filepath.Join(base, "fubar", "restic-cache")
}

func (r *Restic) command(ctx context.Context, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, r.Bin, args...)
	cmd.Env = append(os.Environ(),
		"RESTIC_REPOSITORY="+r.Repo,
		"RESTIC_PASSWORD="+r.Password,
		"RESTIC_CACHE_DIR="+cacheDir(),
	)
	return cmd
}

// runJSON executes restic with --json, forwarding non-summary messages to
// onMsg and returning the final summary message (nil if none was emitted).
func (r *Restic) runJSON(ctx context.Context, onMsg func(map[string]any), args ...string) (map[string]any, error) {
	cmd := r.command(ctx, append([]string{"--json"}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var summary map[string]any
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] != '{' {
			continue
		}
		var msg map[string]any
		if json.Unmarshal(line, &msg) != nil {
			continue
		}
		if msg["message_type"] == "summary" {
			summary = msg
		} else if onMsg != nil {
			onMsg(msg)
		}
	}
	if err := cmd.Wait(); err != nil {
		return summary, fmt.Errorf("restic %s: %w: %s", args[0], err, tail(stderr.String(), 2000))
	}
	return summary, nil
}

func tail(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return "…" + s[len(s)-n:]
	}
	return s
}

// Num pulls a numeric field out of a decoded JSON message.
func Num(m map[string]any, key string) float64 {
	v, _ := m[key].(float64)
	return v
}

// Str pulls a string field out of a decoded JSON message.
func Str(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func (r *Restic) Version(ctx context.Context) (string, error) {
	out, err := r.command(ctx, "version").Output()
	if err != nil {
		return "", fmt.Errorf("restic version (%s): %w", r.Bin, err)
	}
	if f := strings.Fields(string(out)); len(f) >= 2 {
		return f[1], nil
	}
	return strings.TrimSpace(string(out)), nil
}

// EnsureInit initializes the repository unless it already exists.
func (r *Restic) EnsureInit(ctx context.Context) (created bool, err error) {
	if err := r.command(ctx, "cat", "config").Run(); err == nil {
		return false, nil
	}
	if _, err := r.runJSON(ctx, nil, "init"); err != nil {
		return false, err
	}
	return true, nil
}

// BackupSummary is the useful subset of restic's backup summary message.
type BackupSummary struct {
	SnapshotID     string
	FilesNew       int64
	FilesChanged   int64
	DataAddedBytes int64
	TotalBytes     int64
}

// Backup runs `restic backup` over paths, forwarding status messages (with
// percent_done, bytes_done, total_bytes) to onStatus.
func (r *Restic) Backup(ctx context.Context, paths, excludes []string, tag string, onStatus func(map[string]any)) (*BackupSummary, error) {
	args := []string{"backup", "--tag", tag}
	for _, exclude := range excludes {
		args = append(args, "--exclude", exclude)
	}
	args = append(args, paths...)

	summary, err := r.runJSON(ctx, onStatus, args...)
	if err != nil {
		return nil, err
	}
	if summary == nil {
		return nil, fmt.Errorf("restic backup produced no summary")
	}
	return &BackupSummary{
		SnapshotID:     Str(summary, "snapshot_id"),
		FilesNew:       int64(Num(summary, "files_new")),
		FilesChanged:   int64(Num(summary, "files_changed")),
		DataAddedBytes: int64(Num(summary, "data_added_packed")),
		TotalBytes:     int64(Num(summary, "total_bytes_processed")),
	}, nil
}

// Snapshot is one restic snapshot (subset).
type Snapshot struct {
	ID      string   `json:"id"`
	ShortID string   `json:"short_id"`
	Time    string   `json:"time"`
	Paths   []string `json:"paths"`
	Tags    []string `json:"tags"`
}

func (r *Restic) Snapshots(ctx context.Context) ([]Snapshot, error) {
	var stderr bytes.Buffer
	cmd := r.command(ctx, "snapshots", "--json")
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("restic snapshots: %w: %s", err, tail(stderr.String(), 2000))
	}
	var snaps []Snapshot
	if err := json.Unmarshal(out, &snaps); err != nil {
		return nil, fmt.Errorf("parse snapshots: %w", err)
	}
	return snaps, nil
}

// Restore restores a snapshot into target.
func (r *Restic) Restore(ctx context.Context, snapshotID, target string, onStatus func(map[string]any)) error {
	_, err := r.runJSON(ctx, onStatus, "restore", snapshotID, "--target", target)
	return err
}

// Forget applies a retention policy (keepArgs from Plan.ForgetArgs) and prunes.
func (r *Restic) Forget(ctx context.Context, keepArgs []string) error {
	args := append([]string{"forget", "--prune"}, keepArgs...)
	_, err := r.runJSON(ctx, nil, args...)
	return err
}

// Stats returns restic's raw-data size of the repository. restic can precede
// the stats object with other JSON messages (locks, warnings), so scan for the
// object carrying total_size rather than decoding the whole stream.
func (r *Restic) Stats(ctx context.Context) (int64, error) {
	var stderr bytes.Buffer
	cmd := r.command(ctx, "stats", "--json", "--mode", "raw-data")
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("restic stats: %w: %s", err, tail(stderr.String(), 2000))
	}

	sc := bufio.NewScanner(bytes.NewReader(out))
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] != '{' {
			continue
		}
		var stats struct {
			TotalSize *int64 `json:"total_size"`
		}
		if json.Unmarshal(line, &stats) == nil && stats.TotalSize != nil {
			return *stats.TotalSize, nil
		}
	}
	return 0, fmt.Errorf("restic stats: no total_size in output")
}

// Unlock drops stale locks (safe after crashes; fubar holds a local per-plan
// lock, so concurrent fubar runs on the same plan are already excluded).
func (r *Restic) Unlock(ctx context.Context) error {
	return r.command(ctx, "unlock").Run()
}
