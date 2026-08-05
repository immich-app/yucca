package benchwide

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"

	"yuctl/internal/adminapi"
	"yuctl/internal/bench"
	"yuctl/internal/netdev"
	"yuctl/internal/provider"
)

// RepoMinter: the admin-api slice Start needs — repo creation + restic-URL
// minting (URLs embed short-lived JWTs; re-minted each start, never persisted).
type RepoMinter interface {
	CreateRepository(ctx context.Context, name string, worm bool, opts adminapi.CreateRepositoryOptions) (*adminapi.Repository, error)
	RepositoryURL(ctx context.Context, id string) (string, error)
}

// StartOptions shape the load each droplet runs.
type StartOptions struct {
	ClientsPerDroplet int           // default 1
	CycleSize         int64         // dataset per client per cycle (default 8GiB)
	FileSize          int64         // default 64MiB
	PackSizeMiB       int           // restic pack ("object") size, 4..128 (default 16)
	Connections       int           // rest.connections per client (default 5)
	ReadConcurrency   int           // default 4
	Compression       string        // default off
	Duration          time.Duration // 0 = until `stop`
	MaxTransfer       int64         // per-droplet wire cap; 0 = the size's allowance
	Label             string        // results label
	Seed              uint64        // 0 = random
}

func (o *StartOptions) defaults() {
	if o.ClientsPerDroplet <= 0 {
		o.ClientsPerDroplet = 1
	}
	if o.CycleSize <= 0 {
		o.CycleSize = 8 << 30
	}
	if o.FileSize <= 0 {
		o.FileSize = 64 << 20
	}
	if o.PackSizeMiB <= 0 {
		o.PackSizeMiB = 16
	}
	if o.Connections <= 0 {
		o.Connections = 5
	}
	if o.ReadConcurrency <= 0 {
		o.ReadConcurrency = 4
	}
	if o.Compression == "" {
		o.Compression = "off"
	}
	if o.Label == "" {
		o.Label = "run"
	}
	if o.Seed == 0 {
		var b [8]byte
		_, _ = rand.Read(b[:])
		o.Seed = binary.LittleEndian.Uint64(b[:])
	}
}

// killScript stops loadgen everywhere it respawns from: supervisor first, then
// restic. The [b]racket keeps pkill from matching this script's own command line.
const killScript = `pkill -f 'bench-agent --[l]oadgen' 2>/dev/null; sleep 1; pkill -x restic 2>/dev/null; true`

// prepScript and launchScript must stay two SEPARATE ssh execs: merged, prep's
// pkill would match launch's verbatim "bench-agent --loadgen" on its own
// shell's command line and SIGTERM it mid-run (same trap warp's split avoids).
// Neither carries secrets (they ride argv, visible in remote ps); the config
// travels over prep's stdin into a 0600 file the agent deletes after reading.
func prepScript() string {
	return fmt.Sprintf("umask 077; mkdir -p %s; cat > %s; %s; rm -f %s",
		Workdir, configPath, killScript, statusPath)
}

func launchScript() string {
	return fmt.Sprintf(
		"setsid nohup $HOME/%s/bench-agent --loadgen %s </dev/null >> %s 2>&1 & echo launched",
		bench.RemoteBinDir, configPath, agentLog)
}

// Start (re)launches load on every droplet: one repo per client via admin-api,
// re-minted restic URLs, LoadgenConfig over ssh stdin (secrets never in argv).
// A second start = graceful restart with new parameters.
func (s *Session) Start(ctx context.Context, minter RepoMinter, opts StartOptions) error {
	opts.defaults()
	if opts.PackSizeMiB < 4 || opts.PackSizeMiB > 128 {
		return fmt.Errorf("--obj-size %dMiB out of restic's pack-size range (4..128 MiB)", opts.PackSizeMiB)
	}
	droplets, err := s.Droplets(ctx)
	if err != nil {
		return err
	}
	if len(droplets) == 0 {
		return fmt.Errorf("no fleet droplets; run `yuctl tools bench-wide deploy` first")
	}

	clients, err := s.ensureClients(ctx, minter, droplets, opts.ClientsPerDroplet)
	if err != nil {
		return err
	}
	urls := make(map[string]string, len(clients))
	for _, cl := range clients {
		u, err := minter.RepositoryURL(ctx, cl.RepoID)
		if err != nil {
			return fmt.Errorf("mint URL for repo %s (%s): %w", cl.RepoName, cl.RepoID, err)
		}
		urls[cl.Name] = u
	}

	capBytes := opts.MaxTransfer
	if capBytes <= 0 {
		capBytes = s.State.TransferBytes
	}
	if capBytes <= 0 {
		// State was lost but droplets exist: re-derive the allowance rather
		// than ever running uncapped into paid overage.
		size, err := s.Provider.ResolveSize(ctx, droplets[0].SizeSlug)
		if err != nil {
			return fmt.Errorf("no recorded transfer allowance and size lookup failed: %w", err)
		}
		capBytes = size.TransferBytes
		s.State.TransferBytes = capBytes
		s.State.SizeSlug = size.Slug
	}
	log.Info().Int("droplets", len(droplets)).Int("clients", len(clients)).
		Str("obj_size", fmt.Sprintf("%dMiB", opts.PackSizeMiB)).
		Str("cycle_size", bench.FormatBytes(opts.CycleSize)).
		Str("duration", durationLabel(opts.Duration)).
		Str("cap_per_droplet", bench.FormatBytes(capBytes)).
		Str("cap_pool", bench.FormatBytes(capBytes*int64(len(droplets)))).
		Msg("launching load (kill previous, then detach the agent)")

	err = eachDroplet(droplets, func(d provider.Host) error {
		var mine []bench.LoadgenClient
		for _, cl := range clients {
			if cl.Droplet == d.Name {
				mine = append(mine, bench.LoadgenClient{Name: cl.Name, Repo: urls[cl.Name], Password: cl.Password})
			}
		}
		cfg := bench.LoadgenConfig{
			Op:              bench.LoadgenOpLoad,
			Clients:         mine,
			Workdir:         Workdir,
			CycleSize:       opts.CycleSize,
			FileSize:        opts.FileSize,
			Seed:            opts.Seed,
			PackSizeMiB:     opts.PackSizeMiB,
			Connections:     opts.Connections,
			ReadConcurrency: opts.ReadConcurrency,
			Compression:     opts.Compression,
			DurationSeconds: int64(opts.Duration / time.Second),
			MaxUploadBytes:  capBytes,
			StatusPath:      statusPath,
		}
		raw, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		if _, err := s.sshRun(ctx, d.PublicIP, prepScript(), raw); err != nil {
			return fmt.Errorf("prepare %s: %w", d.Name, err)
		}
		out, err := s.sshRun(ctx, d.PublicIP, launchScript(), nil)
		if err != nil {
			return fmt.Errorf("launch on %s: %w", d.Name, err)
		}
		if !strings.Contains(out, "launched") {
			return fmt.Errorf("launch on %s: unexpected output %q", d.Name, tailStr(out, 200))
		}
		log.Info().Str("droplet", d.Name).Str("region", d.Region).Int("clients", len(mine)).Msg("load launched")
		return nil
	})
	if err != nil {
		return err
	}

	s.State.Run = &RunInfo{
		StartedAt: time.Now().UTC(),
		Label:     opts.Label,
		Params: map[string]string{
			"droplets":            strconv.Itoa(len(droplets)),
			"clients_per_droplet": strconv.Itoa(opts.ClientsPerDroplet),
			"obj_size_mib":        strconv.Itoa(opts.PackSizeMiB),
			"cycle_size":          bench.FormatBytes(opts.CycleSize),
			"connections":         strconv.Itoa(opts.Connections),
			"duration":            durationLabel(opts.Duration),
			"cap_per_droplet":     bench.FormatBytes(capBytes),
			"seed":                strconv.FormatUint(opts.Seed, 10),
		},
	}
	if err := s.SaveState(); err != nil {
		return err
	}
	log.Info().Msg("all droplets launched; `yuctl tools bench-wide watch` for the live dashboard")
	return nil
}

func durationLabel(d time.Duration) string {
	if d <= 0 {
		return "nonstop"
	}
	return d.String()
}

// ensureClients reconciles the persisted client list against the live fleet:
// one repository per (droplet, slot), created on first use and reused across
// restarts (fresh seeds keep reuse dedup-proof).
func (s *Session) ensureClients(ctx context.Context, minter RepoMinter, droplets []provider.Host, perDroplet int) ([]Client, error) {
	existing := map[string]Client{}
	for _, cl := range s.State.Clients {
		existing[cl.Name] = cl
	}
	var out []Client
	changed := false
	for _, d := range droplets {
		for j := 1; j <= perDroplet; j++ {
			name := fmt.Sprintf("%s-c%d", d.Name, j)
			if cl, ok := existing[name]; ok {
				out = append(out, cl)
				continue
			}
			repoName := fmt.Sprintf("yucca-benchdo-%s-%s", strings.TrimPrefix(name, "yucca-bench-"), time.Now().Format("20060102-150405"))
			repo, err := minter.CreateRepository(ctx, repoName, false, adminapi.CreateRepositoryOptions{})
			if err != nil {
				return nil, fmt.Errorf("create repository %s: %w", repoName, err)
			}
			cl := Client{Name: name, Droplet: d.Name, RepoID: repo.ID, RepoName: repoName, Password: randHex(16)}
			log.Info().Str("repo", repoName).Str("client", name).Msg("created bench repository (persists after the run)")
			s.State.Clients = append(s.State.Clients, cl)
			out = append(out, cl)
			changed = true
		}
	}
	if changed {
		if err := s.SaveState(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Stop kills the load everywhere (droplets stay deployed) and collects each
// droplet's final status into a Result.
func (s *Session) Stop(ctx context.Context) (*Result, error) {
	droplets, err := s.Droplets(ctx)
	if err != nil {
		return nil, err
	}
	if len(droplets) == 0 {
		log.Info().Msg("no droplets; nothing to stop")
		return nil, nil
	}
	log.Info().Int("droplets", len(droplets)).Msg("stopping load on all droplets")
	if err := eachDroplet(droplets, func(d provider.Host) error {
		_, err := s.sshRun(ctx, d.PublicIP, killScript, nil)
		return err
	}); err != nil {
		return nil, err
	}
	res, err := s.collect(ctx, droplets)
	if err != nil {
		return nil, err
	}
	s.State.Run = nil
	if err := s.SaveState(); err != nil {
		return nil, err
	}
	return res, nil
}

// Result: fleet-aggregated run outcome, written to local JSON on stop. Client
// numbers = restic post-dedup data_added; droplet wire TX = what the allowance saw.
type Result struct {
	Label          string            `json:"label"`
	Partition      string            `json:"partition"`
	Created        time.Time         `json:"created"`
	StartedAt      time.Time         `json:"startedAt,omitempty"`
	ElapsedSeconds float64           `json:"elapsedSeconds,omitempty"`
	Params         map[string]string `json:"params,omitempty"`
	Droplets       []DropletResult   `json:"droplets"`
	TotalUploaded  int64             `json:"totalUploaded"`
	TotalWireTx    int64             `json:"totalWireTx"`
	TotalCycles    int               `json:"totalCycles"`
	TotalErrors    int               `json:"totalErrors"`
}

// DropletResult is one droplet's final tallies.
type DropletResult struct {
	Name        string                      `json:"name"`
	Region      string                      `json:"region"`
	State       string                      `json:"state,omitempty"`
	WireTxBytes int64                       `json:"wireTxBytes"`
	Clients     []bench.LoadgenClientStatus `json:"clients,omitempty"`
}

func (s *Session) collect(ctx context.Context, droplets []provider.Host) (*Result, error) {
	res := &Result{Partition: s.Partition, Created: time.Now().UTC(), Label: "run"}
	if s.State.Run != nil {
		res.Label = s.State.Run.Label
		res.StartedAt = s.State.Run.StartedAt
		res.ElapsedSeconds = time.Since(s.State.Run.StartedAt).Seconds()
		res.Params = s.State.Run.Params
	}
	var mu sync.Mutex
	err := eachDroplet(droplets, func(d provider.Host) error {
		out, err := s.sshRun(ctx, d.PublicIP, "cat "+statusPath+" 2>/dev/null || true", nil)
		if err != nil {
			return err
		}
		dr := DropletResult{Name: d.Name, Region: d.Region}
		var st bench.LoadgenStatus
		if json.Unmarshal([]byte(out), &st) == nil {
			dr.State = st.State
			dr.WireTxBytes = st.WireTxBytes
			dr.Clients = st.Clients
		}
		mu.Lock()
		res.Droplets = append(res.Droplets, dr)
		mu.Unlock()
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, dr := range res.Droplets {
		res.TotalWireTx += dr.WireTxBytes
		for _, cl := range dr.Clients {
			res.TotalUploaded += cl.Uploaded
			res.TotalCycles += cl.Cycles
			res.TotalErrors += cl.Errors
		}
	}
	return res, nil
}

// DropletStatus is one droplet's live sample.
type DropletStatus struct {
	Name, Region, IP        string
	Reachable               bool
	Err                     string
	AgentProcs, ResticProcs int
	TxBps, RxBps            float64
	Status                  *bench.LoadgenStatus
}

// StatusReport is what status/watch render.
type StatusReport struct {
	Run         *RunInfo
	TransferCap int64 // per droplet
	Droplets    []DropletStatus
}

// Status samples every droplet in parallel with one ssh round-trip each:
// NIC counters over the window, the agent's status file, and process counts.
func (s *Session) Status(ctx context.Context, sampleSeconds int) (*StatusReport, error) {
	if sampleSeconds <= 0 {
		sampleSeconds = 5
	}
	droplets, err := s.Droplets(ctx)
	if err != nil {
		return nil, err
	}
	report := &StatusReport{Run: s.State.Run, TransferCap: s.State.TransferBytes}
	script := fmt.Sprintf(
		`cat /proc/net/dev; echo ---S1---; sleep %d; cat /proc/net/dev; echo ---S2---; `+
			`cat %s 2>/dev/null; echo; echo ---S3---; `+
			`echo "$(pgrep -fc 'bench-agent --[l]oadgen') $(pgrep -xc restic)"`,
		sampleSeconds, statusPath)

	var mu sync.Mutex
	_ = eachDroplet(droplets, func(d provider.Host) error {
		ds := DropletStatus{Name: d.Name, Region: d.Region, IP: d.PublicIP}
		out, err := s.sshRun(ctx, d.PublicIP, script, nil)
		if err != nil {
			ds.Err = tailStr(err.Error(), 120)
		} else {
			ds.Reachable = true
			parseSample(out, sampleSeconds, &ds)
		}
		mu.Lock()
		report.Droplets = append(report.Droplets, ds)
		mu.Unlock()
		return nil
	})
	sortDroplets(report.Droplets)
	return report, nil
}

func sortDroplets(ds []DropletStatus) {
	sort.Slice(ds, func(i, j int) bool { return ds[i].Name < ds[j].Name })
}

// parseSample decodes the three-marker sample script output.
func parseSample(out string, sampleSeconds int, ds *DropletStatus) {
	part1, rest, ok := strings.Cut(out, "---S1---")
	if !ok {
		return
	}
	part2, rest, ok := strings.Cut(rest, "---S2---")
	if !ok {
		return
	}
	part3, procs, _ := strings.Cut(rest, "---S3---")

	before := netdev.PhysicalTotals(netdev.Parse(part1))
	after := netdev.PhysicalTotals(netdev.Parse(part2))
	ds.TxBps = float64(after.TX-before.TX) * 8 / float64(sampleSeconds)
	ds.RxBps = float64(after.RX-before.RX) * 8 / float64(sampleSeconds)

	var st bench.LoadgenStatus
	if json.Unmarshal([]byte(strings.TrimSpace(part3)), &st) == nil && !st.StartedAt.IsZero() {
		ds.Status = &st
	}
	if f := strings.Fields(strings.TrimSpace(procs)); len(f) == 2 {
		ds.AgentProcs, _ = strconv.Atoi(f[0])
		ds.ResticProcs, _ = strconv.Atoi(f[1])
	}
}

// Cleanup forgets and prunes every bench-do snapshot, running the agent's
// cleanup op synchronously on each droplet (fresh URLs are minted; the
// droplets must still exist). Refuses while load is running unless force.
func (s *Session) Cleanup(ctx context.Context, minter RepoMinter, force bool) error {
	droplets, err := s.Droplets(ctx)
	if err != nil {
		return err
	}
	if len(droplets) == 0 {
		return fmt.Errorf("no fleet droplets to clean from; repos can only be pruned while the fleet exists")
	}
	if len(s.State.Clients) == 0 {
		log.Info().Msg("no bench repositories recorded; nothing to clean")
		return nil
	}
	if !force {
		if running, err := s.anyLoadRunning(ctx, droplets); err == nil && running {
			return fmt.Errorf("load is still running; `yuctl tools bench-wide stop` first (or --force)")
		}
	}
	byDroplet := map[string][]Client{}
	for _, cl := range s.State.Clients {
		byDroplet[cl.Droplet] = append(byDroplet[cl.Droplet], cl)
	}
	return eachDroplet(droplets, func(d provider.Host) error {
		mine := byDroplet[d.Name]
		if len(mine) == 0 {
			return nil
		}
		var lcs []bench.LoadgenClient
		for _, cl := range mine {
			u, err := minter.RepositoryURL(ctx, cl.RepoID)
			if err != nil {
				return fmt.Errorf("mint URL for %s: %w", cl.RepoName, err)
			}
			lcs = append(lcs, bench.LoadgenClient{Name: cl.Name, Repo: u, Password: cl.Password})
		}
		cfg := bench.LoadgenConfig{Op: bench.LoadgenOpCleanup, Clients: lcs, Workdir: Workdir}
		raw, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		return s.streamCleanup(ctx, d, raw)
	})
}

// streamCleanup runs the agent cleanup op over a live ssh session, logging
// its event stream.
func (s *Session) streamCleanup(ctx context.Context, d provider.Host, cfg []byte) error {
	cmd := exec.CommandContext(ctx, "ssh",
		s.sshArgs(s.Provider.SSHUser()+"@"+d.PublicIP, "$HOME/"+bench.RemoteBinDir+"/bench-agent --loadgen")...)
	cmd.Stdin = strings.NewReader(string(cfg))
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	var fatal string
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 1<<20), 8<<20)
	for sc.Scan() {
		var ev bench.Event
		if json.Unmarshal(sc.Bytes(), &ev) != nil {
			continue
		}
		switch ev.Type {
		case "phase_start":
			log.Info().Str("droplet", d.Name).Msgf("%s: started", ev.Phase)
		case "phase_done":
			e := log.Info().Str("droplet", d.Name)
			if ev.PhaseResult != nil {
				e = e.Str("duration", bench.FormatDuration(ev.PhaseResult.Seconds)).
					Int64("snapshots", ev.PhaseResult.Bytes)
			}
			e.Msgf("%s: done", ev.Phase)
		case "fatal":
			fatal = ev.Message
		}
	}
	if err := cmd.Wait(); err != nil {
		if fatal != "" {
			return fmt.Errorf("cleanup on %s: %s", d.Name, fatal)
		}
		return fmt.Errorf("cleanup ssh session on %s: %w", d.Name, err)
	}
	return nil
}
