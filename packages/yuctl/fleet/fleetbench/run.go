package fleetbench

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"

	"yuctl/adminapi"
	"yuctl/netdev"
	"yuctl/provider"
	"yuctl/resticbench"
	"yuctl/sshx"
)

// RepoMinter is the slice of the admin-api client Start needs: repository
// creation and restic-URL minting (URLs embed short-lived JWTs, so they are
// re-minted on every start, never persisted).
type RepoMinter interface {
	CreateRepository(ctx context.Context, name string, worm bool, opts adminapi.CreateRepositoryOptions) (*adminapi.Repository, error)
	RepositoryURL(ctx context.Context, id string) (string, error)
}

// StartOptions shape the load each host runs.
type StartOptions struct {
	ClientsPerHost  int           // default 1
	CycleSize       int64         // dataset per client per cycle (default 8GiB)
	FileSize        int64         // default 64MiB
	PackSizeMiB     int           // restic pack ("object") size, 4..128 (default 16)
	Connections     int           // rest.connections per client (default 5)
	ReadConcurrency int           // default 4
	Compression     string        // default off
	Duration        time.Duration // 0 = until `stop`
	MaxTransfer     int64         // per-host wire cap; 0 = the size's allowance
	Label           string        // results label
	Seed            uint64        // 0 = random
}

func (o *StartOptions) defaults() {
	if o.ClientsPerHost <= 0 {
		o.ClientsPerHost = 1
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

// killScript stops the loadgen everywhere it can respawn from: the agent
// supervisor first, then any in-flight restic. The [b]racket keeps the pkill
// pattern from matching this very script's command line.
const killScript = `pkill -f 'bench-agent --[l]oadgen' 2>/dev/null; sleep 1; pkill -x restic 2>/dev/null; true`

// prepScript and launchScript are one host's start, as two SEPARATE ssh
// execs. They must not be merged: prep runs the kill patterns, and launch's
// command line spells out "bench-agent --loadgen" verbatim — in one script
// the pkill would match its own shell's command line and SIGTERM it mid-run
// (same trap warp's split kill/launch avoids). Neither script carries
// secrets — they ride ssh argv, visible in remote ps; the config travels
// over prep's stdin into a 0600 file the agent deletes after reading.
func prepScript() string {
	return fmt.Sprintf("umask 077; mkdir -p %s; cat > %s; %s; rm -f %s",
		Workdir, configPath, killScript, statusPath)
}

func launchScript() string {
	return fmt.Sprintf(
		"setsid nohup $HOME/%s/bench-agent --loadgen %s </dev/null >> %s 2>&1 & echo launched",
		resticbench.RemoteBinDir, configPath, agentLog)
}

// Start (re)launches the load on every host: ensures one repository per
// client via the admin-api, re-mints restic URLs, and hands each host a
// LoadgenConfig over ssh stdin (secrets never in argv). A second start is a
// graceful restart with new parameters.
func (s *Session) Start(ctx context.Context, minter RepoMinter, opts StartOptions) error {
	opts.defaults()
	if opts.PackSizeMiB < 4 || opts.PackSizeMiB > 128 {
		return fmt.Errorf("--obj-size %dMiB out of restic's pack-size range (4..128 MiB)", opts.PackSizeMiB)
	}
	hosts, err := s.Hosts(ctx)
	if err != nil {
		return err
	}
	if len(hosts) == 0 {
		return fmt.Errorf("no fleet hosts; run `yuctl tools fleet-bench deploy` first")
	}

	clients, err := s.ensureClients(ctx, minter, hosts, opts.ClientsPerHost)
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
		// State was lost but hosts exist: re-derive the allowance rather
		// than ever running uncapped into paid overage.
		size, err := s.Provider.ResolveSize(ctx, hosts[0].SizeSlug)
		if err != nil {
			return fmt.Errorf("no recorded transfer allowance and size lookup failed: %w", err)
		}
		capBytes = size.TransferBytes
		s.State.TransferBytes = capBytes
		s.State.SizeSlug = size.Slug
	}
	log.Info().Int("hosts", len(hosts)).Int("clients", len(clients)).
		Str("obj_size", fmt.Sprintf("%dMiB", opts.PackSizeMiB)).
		Str("cycle_size", resticbench.FormatBytes(opts.CycleSize)).
		Str("duration", durationLabel(opts.Duration)).
		Str("cap_per_host", resticbench.FormatBytes(capBytes)).
		Str("cap_pool", resticbench.FormatBytes(capBytes*int64(len(hosts)))).
		Msg("launching load (kill previous, then detach the agent)")

	err = eachHost(hosts, func(d provider.Host) error {
		var mine []resticbench.LoadgenClient
		for _, cl := range clients {
			if cl.Host == d.Name {
				mine = append(mine, resticbench.LoadgenClient{Name: cl.Name, Repo: urls[cl.Name], Password: cl.Password})
			}
		}
		cfg := resticbench.LoadgenConfig{
			Op:              resticbench.LoadgenOpLoad,
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
		if _, err := s.ssh.Run(ctx, d.PublicIP, prepScript(), raw); err != nil {
			return fmt.Errorf("prepare %s: %w", d.Name, err)
		}
		out, err := s.ssh.Run(ctx, d.PublicIP, launchScript(), nil)
		if err != nil {
			return fmt.Errorf("launch on %s: %w", d.Name, err)
		}
		if !strings.Contains(out, "launched") {
			return fmt.Errorf("launch on %s: unexpected output %q", d.Name, sshx.Tail(out, 200))
		}
		log.Info().Str("host", d.Name).Str("region", d.Region).Int("clients", len(mine)).Msg("load launched")
		return nil
	})
	if err != nil {
		return err
	}

	s.State.Run = &RunInfo{
		StartedAt: time.Now().UTC(),
		Label:     opts.Label,
		Params: map[string]string{
			"hosts":            strconv.Itoa(len(hosts)),
			"clients_per_host": strconv.Itoa(opts.ClientsPerHost),
			"obj_size_mib":     strconv.Itoa(opts.PackSizeMiB),
			"cycle_size":       resticbench.FormatBytes(opts.CycleSize),
			"connections":      strconv.Itoa(opts.Connections),
			"duration":         durationLabel(opts.Duration),
			"cap_per_host":     resticbench.FormatBytes(capBytes),
			"seed":             strconv.FormatUint(opts.Seed, 10),
		},
	}
	if err := s.SaveState(); err != nil {
		return err
	}
	log.Info().Msg("all hosts launched; `yuctl tools fleet-bench watch` for the live dashboard")
	return nil
}

func durationLabel(d time.Duration) string {
	if d <= 0 {
		return "nonstop"
	}
	return d.String()
}

// ensureClients reconciles the persisted client list against the live fleet:
// one repository per (host, slot), created on first use and reused across
// restarts (fresh seeds keep reuse dedup-proof).
func (s *Session) ensureClients(ctx context.Context, minter RepoMinter, hosts []provider.Host, perHost int) ([]Client, error) {
	existing := map[string]Client{}
	for _, cl := range s.State.Clients {
		existing[cl.Name] = cl
	}
	var out []Client
	changed := false
	for _, d := range hosts {
		for j := 1; j <= perHost; j++ {
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
			cl := Client{Name: name, Host: d.Name, RepoID: repo.ID, RepoName: repoName, Password: randHex(16)}
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

// Stop kills the load everywhere (hosts stay deployed) and collects each
// host's final status into a Result.
func (s *Session) Stop(ctx context.Context) (*Result, error) {
	hosts, err := s.Hosts(ctx)
	if err != nil {
		return nil, err
	}
	if len(hosts) == 0 {
		log.Info().Msg("no hosts; nothing to stop")
		return nil, nil
	}
	log.Info().Int("hosts", len(hosts)).Msg("stopping load on all hosts")
	if err := eachHost(hosts, func(d provider.Host) error {
		_, err := s.ssh.Run(ctx, d.PublicIP, killScript, nil)
		return err
	}); err != nil {
		return nil, err
	}
	res, err := s.collect(ctx, hosts)
	if err != nil {
		return nil, err
	}
	s.State.Run = nil
	if err := s.SaveState(); err != nil {
		return nil, err
	}
	return res, nil
}

// Result is the fleet-aggregated outcome of a run, written to a local JSON on
// stop. Client numbers are restic's post-dedup data_added; host wire TX is
// what the transfer allowance actually saw.
type Result struct {
	Label          string            `json:"label"`
	Partition      string            `json:"partition"`
	Created        time.Time         `json:"created"`
	StartedAt      time.Time         `json:"startedAt,omitempty"`
	ElapsedSeconds float64           `json:"elapsedSeconds,omitempty"`
	Params         map[string]string `json:"params,omitempty"`
	Hosts          []HostResult      `json:"droplets"`
	TotalUploaded  int64             `json:"totalUploaded"`
	TotalWireTx    int64             `json:"totalWireTx"`
	TotalCycles    int               `json:"totalCycles"`
	TotalErrors    int               `json:"totalErrors"`
}

// HostResult is one host's final tallies.
type HostResult struct {
	Name        string                            `json:"name"`
	Region      string                            `json:"region"`
	State       string                            `json:"state,omitempty"`
	WireTxBytes int64                             `json:"wireTxBytes"`
	Clients     []resticbench.LoadgenClientStatus `json:"clients,omitempty"`
}

func (s *Session) collect(ctx context.Context, hosts []provider.Host) (*Result, error) {
	res := &Result{Partition: s.Partition, Created: time.Now().UTC(), Label: "run"}
	if s.State.Run != nil {
		res.Label = s.State.Run.Label
		res.StartedAt = s.State.Run.StartedAt
		res.ElapsedSeconds = time.Since(s.State.Run.StartedAt).Seconds()
		res.Params = s.State.Run.Params
	}
	var mu sync.Mutex
	err := eachHost(hosts, func(d provider.Host) error {
		out, err := s.ssh.Run(ctx, d.PublicIP, "cat "+statusPath+" 2>/dev/null || true", nil)
		if err != nil {
			return err
		}
		dr := HostResult{Name: d.Name, Region: d.Region}
		var st resticbench.LoadgenStatus
		if json.Unmarshal([]byte(out), &st) == nil {
			dr.State = st.State
			dr.WireTxBytes = st.WireTxBytes
			dr.Clients = st.Clients
		}
		mu.Lock()
		res.Hosts = append(res.Hosts, dr)
		mu.Unlock()
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, dr := range res.Hosts {
		res.TotalWireTx += dr.WireTxBytes
		for _, cl := range dr.Clients {
			res.TotalUploaded += cl.Uploaded
			res.TotalCycles += cl.Cycles
			res.TotalErrors += cl.Errors
		}
	}
	return res, nil
}

// HostStatus is one host's live sample.
type HostStatus struct {
	Name, Region, IP        string
	Reachable               bool
	Err                     string
	AgentProcs, ResticProcs int
	TxBps, RxBps            float64
	Status                  *resticbench.LoadgenStatus
}

// StatusReport is what status/watch render.
type StatusReport struct {
	Run         *RunInfo
	TransferCap int64 // per host
	Hosts       []HostStatus
}

// Status samples every host in parallel with one ssh round-trip each:
// NIC counters over the window, the agent's status file, and process counts.
func (s *Session) Status(ctx context.Context, sampleSeconds int) (*StatusReport, error) {
	if sampleSeconds <= 0 {
		sampleSeconds = 5
	}
	hosts, err := s.Hosts(ctx)
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
	_ = eachHost(hosts, func(d provider.Host) error {
		ds := HostStatus{Name: d.Name, Region: d.Region, IP: d.PublicIP}
		out, err := s.ssh.Run(ctx, d.PublicIP, script, nil)
		if err != nil {
			ds.Err = sshx.Tail(err.Error(), 120)
		} else {
			ds.Reachable = true
			parseSample(out, sampleSeconds, &ds)
		}
		mu.Lock()
		report.Hosts = append(report.Hosts, ds)
		mu.Unlock()
		return nil
	})
	sort.Slice(report.Hosts, func(i, j int) bool { return report.Hosts[i].Name < report.Hosts[j].Name })
	return report, nil
}

// parseSample decodes the three-marker sample script output.
func parseSample(out string, sampleSeconds int, ds *HostStatus) {
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

	var st resticbench.LoadgenStatus
	if json.Unmarshal([]byte(strings.TrimSpace(part3)), &st) == nil && !st.StartedAt.IsZero() {
		ds.Status = &st
	}
	if f := strings.Fields(strings.TrimSpace(procs)); len(f) == 2 {
		ds.AgentProcs, _ = strconv.Atoi(f[0])
		ds.ResticProcs, _ = strconv.Atoi(f[1])
	}
}

// Cleanup forgets and prunes every fleet-bench snapshot, running the agent's
// cleanup op synchronously on each host (fresh URLs are minted; the hosts
// must still exist). Refuses while load is running unless force.
func (s *Session) Cleanup(ctx context.Context, minter RepoMinter, force bool) error {
	hosts, err := s.Hosts(ctx)
	if err != nil {
		return err
	}
	if len(hosts) == 0 {
		return fmt.Errorf("no fleet hosts to clean from; repos can only be pruned while the fleet exists")
	}
	if len(s.State.Clients) == 0 {
		log.Info().Msg("no bench repositories recorded; nothing to clean")
		return nil
	}
	if !force {
		if running, err := s.anyLoadRunning(ctx, hosts); err == nil && running {
			return fmt.Errorf("load is still running; `yuctl tools fleet-bench stop` first (or --force)")
		}
	}
	byHost := map[string][]Client{}
	for _, cl := range s.State.Clients {
		byHost[cl.Host] = append(byHost[cl.Host], cl)
	}
	return eachHost(hosts, func(d provider.Host) error {
		mine := byHost[d.Name]
		if len(mine) == 0 {
			return nil
		}
		var lcs []resticbench.LoadgenClient
		for _, cl := range mine {
			u, err := minter.RepositoryURL(ctx, cl.RepoID)
			if err != nil {
				return fmt.Errorf("mint URL for %s: %w", cl.RepoName, err)
			}
			lcs = append(lcs, resticbench.LoadgenClient{Name: cl.Name, Repo: u, Password: cl.Password})
		}
		cfg := resticbench.LoadgenConfig{Op: resticbench.LoadgenOpCleanup, Clients: lcs, Workdir: Workdir}
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
	cmd := s.ssh.Command(ctx, d.PublicIP, "$HOME/"+resticbench.RemoteBinDir+"/bench-agent --loadgen")
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
	_ = resticbench.ScanEvents(stdout, func(ev resticbench.Event) {
		switch ev.Type {
		case "phase_start":
			log.Info().Str("host", d.Name).Msgf("%s: started", ev.Phase)
		case "phase_done":
			e := log.Info().Str("host", d.Name)
			if ev.PhaseResult != nil {
				e = e.Str("duration", resticbench.FormatDuration(ev.PhaseResult.Seconds)).
					Int64("snapshots", ev.PhaseResult.Bytes)
			}
			e.Msgf("%s: done", ev.Phase)
		case "fatal":
			fatal = ev.Message
		}
	})
	if err := cmd.Wait(); err != nil {
		if fatal != "" {
			return fmt.Errorf("cleanup on %s: %s", d.Name, fatal)
		}
		return fmt.Errorf("cleanup ssh session on %s: %w", d.Name, err)
	}
	return nil
}
