package bench

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"
)

type Agent struct {
	cfg  Config
	emit func(Event)
}

func RunAgent(ctx context.Context, cfg Config, emit func(Event)) error {
	if len(cfg.Connections) == 0 {
		cfg.Connections = []int{5}
	}
	if len(cfg.Phases) == 0 {
		cfg.Phases = DefaultPhases
	}
	if cfg.ResticBin == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		cfg.ResticBin = filepath.Join(home, remoteDir, "restic")
	}
	if err := os.MkdirAll(cfg.Workdir, 0o755); err != nil {
		return err
	}

	a := &Agent{cfg: cfg, emit: emit}
	r := &Restic{
		Bin:      cfg.ResticBin,
		Repo:     cfg.Repo,
		Password: cfg.Password,
		CacheDir: filepath.Join(cfg.Workdir, "cache"),
	}

	version, err := r.Version(ctx)
	if err != nil {
		return err
	}
	if err := a.preflight(); err != nil {
		return err
	}

	host, _ := os.Hostname()
	result := &RunResult{
		Label:         cfg.Label,
		Host:          host,
		RepoHost:      scrubRepo(cfg.Repo),
		ResticVersion: version,
		Created:       time.Now().UTC(),
		Config:        publicConfig(cfg),
	}

	if cfg.HasPhase(PhaseBackup) {
		created, err := r.EnsureInit(ctx)
		if err != nil {
			return err
		}
		if !created {
			if ids, err := r.SnapshotIDs(ctx, ""); err == nil && len(ids) > 0 {
				a.emit(Event{Type: "warning", Message: fmt.Sprintf(
					"repository already holds %d snapshots; dedup against them can skew write results", len(ids))})
			}
		}
	}

	for _, conns := range cfg.Connections {
		cell, err := a.runCell(ctx, r, conns)
		if err != nil {
			return fmt.Errorf("cell connections=%d: %w", conns, err)
		}
		result.Cells = append(result.Cells, *cell)
	}

	if cfg.HasPhase(PhaseCleanup) {
		pr, err := a.cleanupPhase(ctx, r)
		if err != nil {
			return err
		}
		result.Cleanup = pr
	}

	a.emit(Event{Type: "result", Result: result})
	return nil
}

// preflight fails fast when the workdir volume clearly cannot hold the dataset.
func (a *Agent) preflight() error {
	if !a.cfg.HasPhase(PhaseGenerate) {
		return nil
	}
	var st syscall.Statfs_t
	if err := syscall.Statfs(a.cfg.Workdir, &st); err != nil {
		return nil
	}
	free := int64(st.Bavail) * int64(st.Bsize) //nolint:unconvert // types differ per GOOS
	need := a.cfg.Size + a.cfg.Size/5
	if a.cfg.KeepData && a.cfg.HasPhase(PhaseRestore) {
		need = 2*a.cfg.Size + a.cfg.Size/5
	}
	if free < need {
		return fmt.Errorf("workdir %s has %s free, need ~%s (size=%s); use a bigger volume or smaller --size",
			a.cfg.Workdir, FormatBytes(free), FormatBytes(need), FormatBytes(a.cfg.Size))
	}
	return nil
}

func (a *Agent) runCell(ctx context.Context, r *Restic, conns int) (*CellResult, error) {
	cfg := a.cfg
	cell := &CellResult{Connections: conns}
	dataDir := filepath.Join(cfg.Workdir, "data")
	restoreDir := filepath.Join(cfg.Workdir, "restore")
	// Per-cell seed: each cell uploads unique content, otherwise cell N>1
	// would dedup against cell 1's snapshots and measure nothing.
	seed := cfg.Seed ^ (0x9e3779b97f4a7c15 * uint64(conns+1))
	cellTag := fmt.Sprintf("%s-c%d", cfg.Tag, conns)
	var manifest *Manifest

	backupArgs := func() []string {
		args := []string{
			"backup", dataDir,
			"--tag", cfg.Tag + "," + cellTag,
			"-o", "rest.connections=" + strconv.Itoa(conns),
		}
		if cfg.Compression != "" {
			args = append(args, "--compression", cfg.Compression)
		}
		if cfg.PackSizeMiB > 0 {
			args = append(args, "--pack-size", strconv.Itoa(cfg.PackSizeMiB))
		}
		if cfg.ReadConcurrency > 0 {
			args = append(args, "--read-concurrency", strconv.Itoa(cfg.ReadConcurrency))
		}
		return args
	}

	if cfg.HasPhase(PhaseGenerate) {
		pr, err := a.phase(PhaseGenerate, conns, func(pr *PhaseResult) error {
			progress := a.progressFn(PhaseGenerate, conns, cfg.Size)
			m, err := Generate(dataDir, cfg.Size, cfg.FileSize, seed, progress)
			if err != nil {
				return err
			}
			manifest = m
			pr.Bytes = cfg.Size
			return nil
		})
		if err != nil {
			return nil, err
		}
		cell.Phases = append(cell.Phases, *pr)
	}

	runBackup := func(name string) error {
		pr, err := a.phase(name, conns, func(pr *PhaseResult) error {
			summary, err := r.runJSON(ctx, a.statusFn(name, conns, "bytes_done", "total_bytes"), backupArgs()...)
			if err != nil {
				return err
			}
			if summary != nil {
				pr.Bytes = int64(num(summary, "total_bytes_processed"))
				pr.BytesAdded = int64(num(summary, "data_added"))
				pr.SnapshotID = str(summary, "snapshot_id")
			}
			return nil
		})
		if err != nil {
			return err
		}
		// Throughput = payload the wire saw: full size initially, delta after.
		if pr.BytesAdded > 0 && pr.Seconds > 0 {
			pr.Throughput = float64(pr.BytesAdded) / pr.Seconds
		}
		cell.Phases = append(cell.Phases, *pr)
		return nil
	}

	if cfg.HasPhase(PhaseBackup) {
		if err := runBackup(PhaseBackup); err != nil {
			return nil, err
		}
	}

	if cfg.HasPhase(PhaseIncremental) && cfg.Incrementals > 0 {
		if manifest == nil {
			return nil, fmt.Errorf("incremental phase needs the generate phase")
		}
		for i := 1; i <= cfg.Incrementals; i++ {
			mutName := fmt.Sprintf("mutate-%d", i)
			pr, err := a.phase(mutName, conns, func(pr *PhaseResult) error {
				written, err := Mutate(dataDir, manifest, cfg.MutatePercent, nil)
				pr.Bytes = written
				return err
			})
			if err != nil {
				return nil, err
			}
			cell.Phases = append(cell.Phases, *pr)
			if err := runBackup(fmt.Sprintf("incremental-%d", i)); err != nil {
				return nil, err
			}
		}
	}

	if cfg.HasPhase(PhaseCheck) {
		pr, err := a.phase(PhaseCheck, conns, func(pr *PhaseResult) error {
			_, err := r.runJSON(ctx, nil,
				"check", "-o", "rest.connections="+strconv.Itoa(conns))
			return err
		})
		if err != nil {
			return nil, err
		}
		cell.Phases = append(cell.Phases, *pr)
	}

	if cfg.HasPhase(PhaseRestore) {
		if !cfg.KeepData {
			// Reclaim the dataset's space before restoring; not timed.
			if err := os.RemoveAll(dataDir); err != nil {
				return nil, err
			}
		}
		if err := os.RemoveAll(restoreDir); err != nil {
			return nil, err
		}
		pr, err := a.phase(PhaseRestore, conns, func(pr *PhaseResult) error {
			summary, err := r.runJSON(ctx, a.statusFn(PhaseRestore, conns, "bytes_restored", "total_bytes"),
				"restore", "latest", "--tag", cellTag,
				"--target", restoreDir,
				"-o", "rest.connections="+strconv.Itoa(conns))
			if err != nil {
				return err
			}
			if summary != nil {
				pr.Bytes = int64(num(summary, "bytes_restored"))
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		cell.Phases = append(cell.Phases, *pr)
		if !cfg.KeepData {
			if err := os.RemoveAll(restoreDir); err != nil {
				return nil, err
			}
		}
	}

	return cell, nil
}

// cleanupPhase forgets every snapshot this tool ever tagged and prunes — a
// heavy listing+delete workload, timed as its own result.
func (a *Agent) cleanupPhase(ctx context.Context, r *Restic) (*PhaseResult, error) {
	ids, err := r.SnapshotIDs(ctx, a.cfg.Tag)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		a.emit(Event{Type: "warning", Message: "cleanup: no snapshots tagged " + a.cfg.Tag})
		return nil, nil
	}
	return a.phase(PhaseCleanup, 0, func(pr *PhaseResult) error {
		if _, err := r.runJSON(ctx, nil, append([]string{"forget"}, ids...)...); err != nil {
			return err
		}
		_, err := r.runJSON(ctx, nil, "prune")
		return err
	})
}

// phase wraps fn with wall-clock timing and start/done events. fn fills the
// PhaseResult's byte counts; Seconds and default Throughput are set here.
func (a *Agent) phase(name string, conns int, fn func(*PhaseResult) error) (*PhaseResult, error) {
	a.emit(Event{Type: "phase_start", Phase: name, Connections: conns})
	pr := &PhaseResult{Name: name}
	start := time.Now()
	if err := fn(pr); err != nil {
		return nil, err
	}
	pr.Seconds = time.Since(start).Seconds()
	if pr.Throughput == 0 && pr.Bytes > 0 && pr.Seconds > 0 {
		pr.Throughput = float64(pr.Bytes) / pr.Seconds
	}
	a.emit(Event{Type: "phase_done", Phase: name, Connections: conns, PhaseResult: pr})
	return pr, nil
}

// progressFn returns a delta-accumulating, 10s-throttled progress emitter for
// locally generated work.
func (a *Agent) progressFn(phase string, conns int, total int64) func(delta int64) {
	var done atomic.Int64
	var last atomic.Int64
	start := time.Now()
	return func(delta int64) {
		d := done.Add(delta)
		now := time.Now().UnixNano()
		prev := last.Load()
		if now-prev < 10*int64(time.Second) || !last.CompareAndSwap(prev, now) {
			return
		}
		elapsed := time.Since(start).Seconds()
		a.emit(Event{Type: "progress", Phase: phase, Connections: conns, Done: d, Total: total,
			BPS: float64(d) / elapsed})
	}
}

func (a *Agent) statusFn(phase string, conns int, doneKey, totalKey string) func(map[string]any) {
	var last time.Time
	start := time.Now()
	return func(m map[string]any) {
		if m["message_type"] != "status" {
			return
		}
		if time.Since(last) < 10*time.Second {
			return
		}
		last = time.Now()
		done := int64(num(m, doneKey))
		elapsed := time.Since(start).Seconds()
		var bps float64
		if elapsed > 0 {
			bps = float64(done) / elapsed
		}
		a.emit(Event{Type: "progress", Phase: phase, Connections: conns,
			Done: done, Total: int64(num(m, totalKey)), BPS: bps})
	}
}
