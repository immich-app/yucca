package bench

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"yuctl/internal/netdev"
)

// Loadgen is the bench-do agent mode: a supervisor looping one continuous
// restic backup per client until duration elapses, the droplet's transfer cap
// hits, or it is killed. Runs detached (nohup): progress goes to a status file
// sampled over ssh, not a live event stream.

const (
	LoadgenOpLoad    = "load"
	LoadgenOpCleanup = "cleanup"
)

type LoadgenClient struct {
	Name     string `json:"name"`
	Repo     string `json:"repo"`
	Password string `json:"password"`
}

// LoadgenConfig: one droplet's full instruction set — a 0600 file the agent
// deletes after reading (load) or stdin (cleanup); repo URLs embed JWTs, never argv.
type LoadgenConfig struct {
	Op      string          `json:"op"` // load (default) | cleanup
	Clients []LoadgenClient `json:"clients"`
	Workdir string          `json:"workdir"`

	CycleSize int64  `json:"cycleSize"` // dataset bytes per client per cycle
	FileSize  int64  `json:"fileSize"`
	Seed      uint64 `json:"seed"`

	PackSizeMiB     int    `json:"packSizeMiB"`
	Connections     int    `json:"connections"` // rest.connections per client
	ReadConcurrency int    `json:"readConcurrency"`
	Compression     string `json:"compression"`

	DurationSeconds int64 `json:"durationSeconds"` // 0 = until killed
	MaxUploadBytes  int64 `json:"maxUploadBytes"`  // droplet wire-TX cap; 0 = uncapped

	Tag        string `json:"tag"`
	ResticBin  string `json:"resticBin"`
	StatusPath string `json:"statusPath"`
}

func (c *LoadgenConfig) defaults() error {
	if c.Op == "" {
		c.Op = LoadgenOpLoad
	}
	if len(c.Clients) == 0 {
		return errors.New("loadgen config has no clients")
	}
	if c.Workdir == "" {
		c.Workdir = "/var/tmp/yucca-bench-do"
	}
	if c.CycleSize <= 0 {
		c.CycleSize = 8 << 30
	}
	if c.FileSize <= 0 || c.FileSize > c.CycleSize {
		c.FileSize = min(64<<20, c.CycleSize)
	}
	if c.Connections <= 0 {
		c.Connections = 5
	}
	if c.ReadConcurrency <= 0 {
		c.ReadConcurrency = 4
	}
	if c.Compression == "" {
		c.Compression = "off"
	}
	if c.Tag == "" {
		c.Tag = "yucca-bench-do"
	}
	if c.ResticBin == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		c.ResticBin = filepath.Join(home, remoteDir, "restic")
	}
	if c.StatusPath == "" {
		c.StatusPath = filepath.Join(c.Workdir, "status.json")
	}
	return nil
}

// LoadgenStatus is the droplet-local progress file, rewritten atomically every
// few seconds and read (plus a live NIC sample) by `bench-do status`.
type LoadgenStatus struct {
	StartedAt       time.Time             `json:"startedAt"`
	UpdatedAt       time.Time             `json:"updatedAt"`
	State           string                `json:"state"` // running | done | capped
	DurationSeconds int64                 `json:"durationSeconds"`
	CapBytes        int64                 `json:"capBytes"`
	WireTxBytes     int64                 `json:"wireTxBytes"` // physical-NIC TX since agent start
	Clients         []LoadgenClientStatus `json:"clients"`
}

type LoadgenClientStatus struct {
	Name         string `json:"name"`
	Phase        string `json:"phase"` // init | generate | backup | idle
	Cycles       int    `json:"cycles"`
	Uploaded     int64  `json:"uploaded"`     // cumulative post-dedup bytes (restic data_added)
	CurrentBytes int64  `json:"currentBytes"` // progress inside the current phase
	Errors       int    `json:"errors"`
	LastError    string `json:"lastError,omitempty"`
}

// loadgenState is the mutable run state shared between client loops, the NIC
// sampler, and the status writer.
type loadgenState struct {
	mu     sync.Mutex
	status LoadgenStatus
}

func (s *loadgenState) update(fn func(*LoadgenStatus)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.status)
}

func (s *loadgenState) write(path string) error {
	s.mu.Lock()
	s.status.UpdatedAt = time.Now().UTC()
	b, err := json.MarshalIndent(&s.status, "", "  ")
	s.mu.Unlock()
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func physicalTX() (int64, bool) {
	b, err := os.ReadFile("/proc/net/dev")
	if err != nil {
		return 0, false
	}
	return int64(netdev.PhysicalTotals(netdev.Parse(string(b))).TX), true
}

// RunLoadgen supervises the client loops; nil on a clean end (duration/cap —
// recorded in the status file), error only for setup failures.
func RunLoadgen(ctx context.Context, cfg LoadgenConfig) error {
	if err := cfg.defaults(); err != nil {
		return err
	}
	if err := os.MkdirAll(cfg.Workdir, 0o755); err != nil {
		return err
	}
	baseTX, txOK := physicalTX()
	if !txOK && cfg.MaxUploadBytes > 0 {
		return errors.New("transfer cap requested but /proc/net/dev is unreadable")
	}

	state := &loadgenState{status: LoadgenStatus{
		StartedAt:       time.Now().UTC(),
		State:           "running",
		DurationSeconds: cfg.DurationSeconds,
		CapBytes:        cfg.MaxUploadBytes,
		Clients:         make([]LoadgenClientStatus, len(cfg.Clients)),
	}}
	for i, cl := range cfg.Clients {
		state.status.Clients[i] = LoadgenClientStatus{Name: cl.Name, Phase: "init"}
	}
	if err := state.write(cfg.StatusPath); err != nil {
		return fmt.Errorf("write status file: %w", err)
	}

	runCtx := ctx
	var cancel context.CancelFunc
	if cfg.DurationSeconds > 0 {
		runCtx, cancel = context.WithTimeout(ctx, time.Duration(cfg.DurationSeconds)*time.Second)
	} else {
		runCtx, cancel = context.WithCancel(ctx)
	}
	defer cancel()

	// Sampler: tracks wire TX, enforces the cap, and flushes the status file.
	samplerDone := make(chan struct{})
	go func() {
		defer close(samplerDone)
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
			}
			if txOK {
				if tx, ok := physicalTX(); ok {
					wire := tx - baseTX
					state.update(func(st *LoadgenStatus) { st.WireTxBytes = wire })
					if cfg.MaxUploadBytes > 0 && wire >= cfg.MaxUploadBytes {
						state.update(func(st *LoadgenStatus) { st.State = "capped" })
						cancel()
					}
				}
			}
			_ = state.write(cfg.StatusPath)
		}
	}()

	var wg sync.WaitGroup
	for i, cl := range cfg.Clients {
		wg.Add(1)
		go func(i int, cl LoadgenClient) {
			defer wg.Done()
			clientLoop(runCtx, cfg, i, cl, state)
		}(i, cl)
	}
	wg.Wait()
	cancel()
	<-samplerDone

	state.update(func(st *LoadgenStatus) {
		if txOK {
			if tx, ok := physicalTX(); ok {
				st.WireTxBytes = tx - baseTX
			}
		}
		if st.State == "running" {
			st.State = "done"
		}
		for i := range st.Clients {
			st.Clients[i].Phase = "idle"
		}
	})
	return state.write(cfg.StatusPath)
}

// clientLoop: one client's endless generate→backup cycle, fresh seed each pass
// (nothing dedups against earlier uploads); errors back off and retry, never
// kill the droplet's load.
func clientLoop(ctx context.Context, cfg LoadgenConfig, idx int, cl LoadgenClient, state *loadgenState) {
	dataDir := filepath.Join(cfg.Workdir, cl.Name, "data")
	r := &Restic{
		Bin:      cfg.ResticBin,
		Repo:     cl.Repo,
		Password: cl.Password,
		CacheDir: filepath.Join(cfg.Workdir, cl.Name, "cache"),
	}
	set := func(fn func(*LoadgenClientStatus)) {
		state.update(func(st *LoadgenStatus) { fn(&st.Clients[idx]) })
	}
	fail := func(err error) {
		set(func(c *LoadgenClientStatus) {
			c.Errors++
			c.LastError = time.Now().UTC().Format(time.RFC3339) + " " + err.Error()
		})
		select {
		case <-ctx.Done():
		case <-time.After(15 * time.Second):
		}
	}

	// Init retries as long as the run does: giving up on transient 500s (under
	// the very load being generated) would silently thin the fleet; fail() paces.
	for {
		_, err := r.EnsureInit(ctx)
		if err == nil {
			break
		}
		if ctx.Err() != nil {
			return
		}
		fail(fmt.Errorf("init repo: %w", err))
	}

	backupArgs := []string{
		"backup", dataDir,
		"--tag", cfg.Tag,
		"-o", "rest.connections=" + strconv.Itoa(cfg.Connections),
		"--compression", cfg.Compression,
		"--read-concurrency", strconv.Itoa(cfg.ReadConcurrency),
	}
	if cfg.PackSizeMiB > 0 {
		backupArgs = append(backupArgs, "--pack-size", strconv.Itoa(cfg.PackSizeMiB))
	}

	for cycle := 0; ctx.Err() == nil; cycle++ {
		// Distinct per client and per cycle, deterministic from the run seed.
		seed := cfg.Seed ^ (0x9e3779b97f4a7c15 * uint64(idx*100000+cycle+1))

		set(func(c *LoadgenClientStatus) { c.Phase = "generate"; c.CurrentBytes = 0 })
		_, err := Generate(dataDir, cfg.CycleSize, cfg.FileSize, seed, func(delta int64) {
			set(func(c *LoadgenClientStatus) { c.CurrentBytes += delta })
		})
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			fail(fmt.Errorf("generate: %w", err))
			continue
		}

		// A previous kill (stop/cap) may have left a stale lock behind.
		_, _ = r.runJSON(ctx, nil, "unlock")

		set(func(c *LoadgenClientStatus) { c.Phase = "backup"; c.CurrentBytes = 0 })
		summary, err := r.runJSON(ctx, func(m map[string]any) {
			if m["message_type"] == "status" {
				done := int64(num(m, "bytes_done"))
				set(func(c *LoadgenClientStatus) { c.CurrentBytes = done })
			}
		}, backupArgs...)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			fail(fmt.Errorf("backup: %w", err))
			continue
		}
		set(func(c *LoadgenClientStatus) {
			c.Cycles++
			c.CurrentBytes = 0
			if summary != nil {
				c.Uploaded += int64(num(summary, "data_added"))
			}
		})
	}
}

// RunLoadgenCleanup forgets+prunes every bench-do snapshot per client,
// streaming bench Events (synchronous over the orchestrator's ssh, unlike
// the detached load mode).
func RunLoadgenCleanup(ctx context.Context, cfg LoadgenConfig, emit func(Event)) error {
	if err := cfg.defaults(); err != nil {
		return err
	}
	for _, cl := range cfg.Clients {
		r := &Restic{
			Bin:      cfg.ResticBin,
			Repo:     cl.Repo,
			Password: cl.Password,
			CacheDir: filepath.Join(cfg.Workdir, cl.Name, "cache"),
		}
		emit(Event{Type: "phase_start", Phase: "cleanup " + cl.Name})
		start := time.Now()
		_, _ = r.runJSON(ctx, nil, "unlock")
		ids, err := r.SnapshotIDs(ctx, cfg.Tag)
		if err != nil {
			return fmt.Errorf("%s: %w", cl.Name, err)
		}
		if len(ids) > 0 {
			if _, err := r.runJSON(ctx, nil, append([]string{"forget"}, ids...)...); err != nil {
				return fmt.Errorf("%s: forget: %w", cl.Name, err)
			}
			if _, err := r.runJSON(ctx, nil, "prune"); err != nil {
				return fmt.Errorf("%s: prune: %w", cl.Name, err)
			}
		}
		emit(Event{Type: "phase_done", Phase: "cleanup " + cl.Name,
			PhaseResult: &PhaseResult{Name: "cleanup " + cl.Name, Seconds: time.Since(start).Seconds(), Bytes: int64(len(ids))}})
		_ = os.RemoveAll(filepath.Join(cfg.Workdir, cl.Name))
	}
	return nil
}
