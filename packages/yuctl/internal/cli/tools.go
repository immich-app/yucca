package cli

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
	"yuctl/internal/bench"
	yctx "yuctl/internal/context"
	"yuctl/internal/discovery"
)

func newToolsCmd() *cobra.Command {
	tools := &cobra.Command{
		Use:   "tools",
		Short: "Operational tooling for the selected context",
	}
	tools.AddCommand(newBenchCmd(), newBenchWideCmd(), newWarpCmd())
	return tools
}

type benchFlags struct {
	admin adminFlags

	host          string
	fromHere      bool
	sshIdentity   string
	sshUser       string
	agentBin      string
	repo          string
	repoID        string
	passwordFile  string
	workdir       string
	size          string
	fileSize      string
	connections   string
	readConc      int
	packSizeMiB   int
	compression   string
	incrementals  int
	mutatePercent float64
	phases        string
	seed          uint64
	label         string
	out           string
	keepData      bool
	cleanup       bool
}

func (f *benchFlags) registerCommon(c *cobra.Command) {
	f.admin.register(c)
	c.Flags().StringVar(&f.host, "host", "", "ssh destination of the management host (default: the region's first mgmt host from discovery)")
	c.Flags().BoolVar(&f.fromHere, "from-here", false, "run the benchmark on this machine (no ssh; agent runs in-process)")
	c.Flags().StringVar(&f.sshIdentity, "ssh-identity", "", "ssh private key for the management host (default: ssh agent/config)")
	c.Flags().StringVar(&f.sshUser, "ssh-user", "", "ssh username for the discovery-resolved mgmt host (default: your local username; identity-registry accounts differ)")
	c.Flags().StringVar(&f.agentBin, "agent-bin", "", "local linux/amd64 bench-agent binary (default: the embedded one)")
	c.Flags().StringVar(&f.repo, "repo", "", "restic repository URL; skips admin-api provisioning (default $RESTIC_REPOSITORY, else a repo is created via admin-api)")
	c.Flags().StringVar(&f.repoID, "repo-id", "", "existing repository id; a fresh URL is minted via admin-api")
	c.Flags().StringVar(&f.passwordFile, "password-file", "", "local file with the restic password (default $RESTIC_PASSWORD; auto-generated for auto-created repos)")
	c.Flags().StringVar(&f.workdir, "workdir", "/var/tmp/yucca-bench", "remote scratch directory (must fit --size)")
}

func newBenchCmd() *cobra.Command {
	f := &benchFlags{}
	cmd := &cobra.Command{
		Use:   "bench",
		Short: "Benchmark michael end-to-end with restic from a management host",
		Long: "Pushes a bench agent + a pinned restic to a management host of the selected\n" +
			"region and runs write/incremental/check/restore phases against michael,\n" +
			"streaming progress back and saving a results JSON locally. Without --repo,\n" +
			"a fresh benchmark repository is created via the admin-api (yuctl login).",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return f.runBench(cmd, bench.DefaultPhases)
		},
	}
	f.registerCommon(cmd)
	cmd.Flags().StringVar(&f.size, "size", "32GiB", "dataset size per cell (e.g. 1TiB)")
	cmd.Flags().StringVar(&f.fileSize, "file-size", "64MiB", "size of each generated file")
	cmd.Flags().StringVar(&f.connections, "connections", "5", "rest.connections sweep, comma-separated (e.g. 5,16,32,64)")
	cmd.Flags().IntVar(&f.readConc, "read-concurrency", 4, "restic backup read concurrency")
	cmd.Flags().IntVar(&f.packSizeMiB, "pack-size", 16, "restic pack size in MiB (16 = restic default, max 128)")
	cmd.Flags().StringVar(&f.compression, "compression", "off", "restic compression (off keeps client CPU out of the way; bench data is incompressible)")
	cmd.Flags().IntVar(&f.incrementals, "incrementals", 2, "incremental backup rounds per cell")
	cmd.Flags().Float64Var(&f.mutatePercent, "mutate-percent", 2, "percent of files rewritten before each incremental")
	cmd.Flags().StringVar(&f.phases, "phases", strings.Join(bench.DefaultPhases, ","), "phases to run")
	cmd.Flags().Uint64Var(&f.seed, "seed", 0, "dataset seed (0 = random; reuse for identical content across runs)")
	cmd.Flags().StringVar(&f.label, "label", "run", "label stored in the results (e.g. before, after)")
	cmd.Flags().StringVar(&f.out, "out", "", "local results file (default bench-<label>-<timestamp>.json)")
	cmd.Flags().BoolVar(&f.keepData, "keep-data", false, "keep dataset and restore target on disk (doubles space needs)")
	cmd.Flags().BoolVar(&f.cleanup, "cleanup", false, "forget+prune this tool's snapshots after the run (also timed)")

	cmd.AddCommand(newBenchCompareCmd(), newBenchCleanupCmd())
	return cmd
}

func newBenchCompareCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "compare <before.json> <after.json>",
		Short: "Render before/after deltas from two results files",
		Args:  cobra.ExactArgs(2),
		RunE: func(_ *cobra.Command, args []string) error {
			before, err := bench.LoadResult(args[0])
			if err != nil {
				return err
			}
			after, err := bench.LoadResult(args[1])
			if err != nil {
				return err
			}
			bench.RenderCompare(os.Stdout, before, after)
			return nil
		},
	}
}

func newBenchCleanupCmd() *cobra.Command {
	f := &benchFlags{}
	cmd := &cobra.Command{
		Use:   "cleanup",
		Short: "Forget and prune every snapshot created by the bench (timed)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return f.runBench(cmd, []string{bench.PhaseCleanup})
		},
	}
	f.registerCommon(cmd)
	return cmd
}

// runBench resolves the context (host from discovery, repository via admin-api
// unless supplied) and drives the run. Context/topology are resolved lazily so
// a --from-here run with an explicit --repo needs neither state creds nor a
// selected context (e.g. yuctl invoked directly on a mgmt host).
func (f *benchFlags) runBench(cmd *cobra.Command, defaultPhases []string) error {
	ctx := cmd.Context()

	var cc *yctx.Context
	var topo *discovery.Topology
	loadTopo := func() error {
		if topo != nil {
			return nil
		}
		var err error
		if cc, err = requireContext(); err != nil {
			return err
		}
		topo, err = resolveTopology(ctx)
		return err
	}

	var host string
	switch {
	case f.fromHere && f.host != "":
		return fmt.Errorf("--from-here and --host are mutually exclusive")
	case f.fromHere:
		// no remote host: the agent runs in-process on this machine
	case f.host != "":
		host = f.host
	default:
		if err := loadTopo(); err != nil {
			return err
		}
		hosts := topo.MgmtHosts(cc.Partition, cc.Region)
		if len(hosts) == 0 {
			return fmt.Errorf("discovery has no mgmt hosts for %s@%s; pass --host (or --from-here)", cc.Partition, cc.Region)
		}
		host = hosts[0].PublicIP
		if f.sshUser != "" {
			host = f.sshUser + "@" + host
		}
		log.Info().Str("mgmt", hosts[0].Name).Str("host", host).Msg("using mgmt host from discovery")
	}

	cfg, err := f.buildConfig(defaultPhases)
	if err != nil {
		return err
	}

	if cfg.Repo == "" {
		// Topology is only needed to derive the admin URL; an explicit
		// --admin-url / $YUCTL_ADMIN_API_URL skips state access entirely
		// (the context file alone names the token-cache partition).
		if f.admin.adminURL == "" && os.Getenv("YUCTL_ADMIN_API_URL") == "" {
			if err := loadTopo(); err != nil {
				return err
			}
		} else if cc == nil {
			if cc, err = requireContext(); err != nil {
				return err
			}
		}
		client, _, err := f.admin.adminLogin(ctx, cmd, cc, topo)
		if err != nil {
			return err
		}
		repoID := f.repoID
		if repoID == "" {
			name := fmt.Sprintf("yucca-bench-%s-%s", cfg.Label, time.Now().Format("20060102-150405"))
			repo, err := client.CreateRepository(ctx, name, false, adminapi.CreateRepositoryOptions{})
			if err != nil {
				return fmt.Errorf("create benchmark repository: %w", err)
			}
			repoID = repo.ID
			// Repos can't be deleted yet (needs S3-side removal); prune leaves
			// them ~empty and the yucca-bench- prefix marks them for later.
			log.Info().Str("id", repo.ID).Str("name", name).Msg("created benchmark repository (persists after the run)")
		}
		minted, err := client.RepositoryURL(ctx, repoID, adminapi.URLOptions{Label: "yuctl bench"})
		if err != nil {
			return fmt.Errorf("mint repository URL: %w", err)
		}
		cfg.Repo = minted.URL
		if cfg.Password == "" {
			cfg.Password = randHex(16)
			// Logged on purpose: it guards a throwaway repo of random bytes,
			// and without it the repo can't be reopened (e.g. for cleanup).
			log.Info().Str("password", cfg.Password).Msg("generated repository password — keep it to reopen this repo")
		}
	} else if cfg.Password == "" {
		return fmt.Errorf("no password: set --password-file or RESTIC_PASSWORD")
	}

	if f.out == "" {
		f.out = fmt.Sprintf("bench-%s-%s.json", cfg.Label, time.Now().Format("20060102-150405"))
	}
	outPath := f.out
	if len(cfg.Phases) == 1 && cfg.Phases[0] == bench.PhaseCleanup {
		outPath = ""
	}

	opts := bench.RunOpts{Host: host, SSHIdentity: f.sshIdentity, AgentBin: f.agentBin, Config: cfg, Out: outPath}
	if f.fromHere {
		_, err = bench.RunHere(ctx, opts)
	} else {
		_, err = bench.Run(ctx, opts)
	}
	return err
}

func (f *benchFlags) buildConfig(defaultPhases []string) (bench.Config, error) {
	cfg := bench.Config{
		Workdir:         f.workdir,
		ReadConcurrency: f.readConc,
		PackSizeMiB:     f.packSizeMiB,
		Compression:     f.compression,
		Incrementals:    f.incrementals,
		MutatePercent:   f.mutatePercent,
		Label:           f.label,
		Tag:             "yucca-bench",
		KeepData:        f.keepData,
		Seed:            f.seed,
		Phases:          defaultPhases,
	}
	if cfg.Label == "" {
		cfg.Label = "run"
	}

	cfg.Repo = f.repo
	if cfg.Repo == "" && f.repoID == "" {
		cfg.Repo = os.Getenv("RESTIC_REPOSITORY")
	}
	if f.passwordFile != "" {
		b, err := os.ReadFile(f.passwordFile)
		if err != nil {
			return cfg, err
		}
		cfg.Password = strings.TrimSpace(string(b))
	} else {
		cfg.Password = os.Getenv("RESTIC_PASSWORD")
	}

	if f.size != "" {
		size, err := bench.ParseSize(f.size)
		if err != nil {
			return cfg, err
		}
		cfg.Size = size
		fileSize, err := bench.ParseSize(f.fileSize)
		if err != nil {
			return cfg, err
		}
		cfg.FileSize = fileSize
	}

	if f.connections != "" {
		for _, s := range strings.Split(f.connections, ",") {
			n, err := strconv.Atoi(strings.TrimSpace(s))
			if err != nil || n < 1 {
				return cfg, fmt.Errorf("invalid --connections value %q", s)
			}
			cfg.Connections = append(cfg.Connections, n)
		}
	}

	if f.phases != "" {
		cfg.Phases = strings.Split(f.phases, ",")
	}
	if f.cleanup && !cfg.HasPhase(bench.PhaseCleanup) {
		cfg.Phases = append(cfg.Phases, bench.PhaseCleanup)
	}

	if cfg.Seed == 0 {
		var b [8]byte
		if _, err := rand.Read(b[:]); err != nil {
			return cfg, err
		}
		cfg.Seed = binary.LittleEndian.Uint64(b[:])
	}
	return cfg, nil
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
