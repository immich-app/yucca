package bench

import (
	"context"
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

	"yuctl/adminapi"
	"yuctl/cmdutil"
	"yuctl/resticbench"
)

func New(f *cmdutil.Factory) *cobra.Command {
	o := &options{}
	cmd := &cobra.Command{
		Use:   "bench",
		Short: "Benchmark michael end-to-end with restic from a management host",
		Long: "Pushes a bench agent + a pinned restic to a management host of the selected\n" +
			"region and runs write/incremental/check/restore phases against michael,\n" +
			"streaming progress back and saving a results JSON locally. Without --repo,\n" +
			"a fresh benchmark repository is created via the admin-api (yuctl login).",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return o.run(cmd.Context(), f, resticbench.DefaultPhases)
		},
	}
	o.registerCommon(cmd)
	cmd.Flags().StringVar(&o.size, "size", "32GiB", "dataset size per cell (e.g. 1TiB)")
	cmd.Flags().StringVar(&o.fileSize, "file-size", "64MiB", "size of each generated file")
	cmd.Flags().StringVar(&o.connections, "connections", "5", "rest.connections sweep, comma-separated (e.g. 5,16,32,64)")
	cmd.Flags().IntVar(&o.readConc, "read-concurrency", 4, "restic backup read concurrency")
	cmd.Flags().IntVar(&o.packSizeMiB, "pack-size", 16, "restic pack size in MiB (16 = restic default, max 128)")
	cmd.Flags().StringVar(&o.compression, "compression", "off", "restic compression (off keeps client CPU out of the way; bench data is incompressible)")
	cmd.Flags().IntVar(&o.incrementals, "incrementals", 2, "incremental backup rounds per cell")
	cmd.Flags().Float64Var(&o.mutatePercent, "mutate-percent", 2, "percent of files rewritten before each incremental")
	cmd.Flags().StringVar(&o.phases, "phases", strings.Join(resticbench.DefaultPhases, ","), "phases to run")
	cmd.Flags().Uint64Var(&o.seed, "seed", 0, "dataset seed (0 = random; reuse for identical content across runs)")
	cmd.Flags().StringVar(&o.label, "label", "run", "label stored in the results (e.g. before, after)")
	cmd.Flags().StringVar(&o.out, "out", "", "local results file (default bench-<label>-<timestamp>.json)")
	cmd.Flags().BoolVar(&o.keepData, "keep-data", false, "keep dataset and restore target on disk (doubles space needs)")
	cmd.Flags().BoolVar(&o.cleanup, "cleanup", false, "forget+prune this tool's snapshots after the run (also timed)")

	cmd.AddCommand(newCompareCmd(f), newCleanupCmd(f))
	return cmd
}

func newCompareCmd(f *cmdutil.Factory) *cobra.Command {
	return &cobra.Command{
		Use:   "compare <before.json> <after.json>",
		Short: "Render before/after deltas from two results files",
		Args:  cobra.ExactArgs(2),
		RunE: func(_ *cobra.Command, args []string) error {
			before, err := resticbench.LoadResult(args[0])
			if err != nil {
				return err
			}
			after, err := resticbench.LoadResult(args[1])
			if err != nil {
				return err
			}
			resticbench.RenderCompare(f.IO.Out, before, after)
			return nil
		},
	}
}

func newCleanupCmd(f *cmdutil.Factory) *cobra.Command {
	o := &options{}
	cmd := &cobra.Command{
		Use:   "cleanup",
		Short: "Forget and prune every snapshot created by the bench (timed)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return o.run(cmd.Context(), f, []string{resticbench.PhaseCleanup})
		},
	}
	o.registerCommon(cmd)
	return cmd
}

type options struct {
	admin cmdutil.AdminFlags

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

func (o *options) registerCommon(c *cobra.Command) {
	o.admin.Register(c)
	c.Flags().StringVar(&o.host, "host", "", "ssh destination of the management host (default: the region's first mgmt host from discovery)")
	c.Flags().BoolVar(&o.fromHere, "from-here", false, "run the benchmark on this machine (no ssh; agent runs in-process)")
	c.Flags().StringVar(&o.sshIdentity, "ssh-identity", "", "ssh private key for the management host (default: ssh agent/config)")
	c.Flags().StringVar(&o.sshUser, "ssh-user", "", "ssh username for the discovery-resolved mgmt host (default: your local username; identity-registry accounts differ)")
	c.Flags().StringVar(&o.agentBin, "agent-bin", "", "local linux/amd64 bench-agent binary (default: the embedded one)")
	c.Flags().StringVar(&o.repo, "repo", "", "restic repository URL; skips admin-api provisioning (default $RESTIC_REPOSITORY, else a repo is created via admin-api)")
	c.Flags().StringVar(&o.repoID, "repo-id", "", "existing repository id; a fresh URL is minted via admin-api")
	c.Flags().StringVar(&o.passwordFile, "password-file", "", "local file with the restic password (default $RESTIC_PASSWORD; auto-generated for auto-created repos)")
	c.Flags().StringVar(&o.workdir, "workdir", "/var/tmp/yucca-bench", "remote scratch directory (must fit --size)")
}

// run resolves the target (host from discovery, repository via admin-api
// unless supplied) and drives the benchmark. Context/topology are resolved
// lazily through the factory so a --from-here run with an explicit --repo
// needs neither state creds nor a selected context (e.g. yuctl invoked
// directly on a mgmt host).
func (o *options) run(ctx context.Context, f *cmdutil.Factory, defaultPhases []string) error {
	var host string
	switch {
	case o.fromHere && o.host != "":
		return fmt.Errorf("--from-here and --host are mutually exclusive")
	case o.fromHere:
		// no remote host: the agent runs in-process on this machine
	case o.host != "":
		host = o.host
	default:
		cc, err := f.Context()
		if err != nil {
			return err
		}
		topo, err := f.Topology(ctx)
		if err != nil {
			return err
		}
		hosts := topo.MgmtHosts(cc.Partition, cc.Region)
		if len(hosts) == 0 {
			return fmt.Errorf("discovery has no mgmt hosts for %s@%s; pass --host (or --from-here)", cc.Partition, cc.Region)
		}
		host = hosts[0].PublicIP
		if o.sshUser != "" {
			host = o.sshUser + "@" + host
		}
		log.Info().Str("mgmt", hosts[0].Name).Str("host", host).Msg("using mgmt host from discovery")
	}

	cfg, err := o.buildConfig(defaultPhases)
	if err != nil {
		return err
	}

	if cfg.Repo == "" {
		cc, err := f.Context()
		if err != nil {
			return err
		}
		topo, err := o.admin.OptionalTopology(ctx, f)
		if err != nil {
			return err
		}
		client, _, err := o.admin.Login(ctx, f, cc, topo)
		if err != nil {
			return err
		}
		repoID := o.repoID
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
		url, err := client.RepositoryURL(ctx, repoID)
		if err != nil {
			return fmt.Errorf("mint repository URL: %w", err)
		}
		cfg.Repo = url
		if cfg.Password == "" {
			cfg.Password = randHex(16)
			// Logged on purpose: it guards a throwaway repo of random bytes,
			// and without it the repo can't be reopened (e.g. for cleanup).
			log.Info().Str("password", cfg.Password).Msg("generated repository password — keep it to reopen this repo")
		}
	} else if cfg.Password == "" {
		return fmt.Errorf("no password: set --password-file or RESTIC_PASSWORD")
	}

	if o.out == "" {
		o.out = fmt.Sprintf("bench-%s-%s.json", cfg.Label, time.Now().Format("20060102-150405"))
	}
	outPath := o.out
	if len(cfg.Phases) == 1 && cfg.Phases[0] == resticbench.PhaseCleanup {
		outPath = ""
	}

	opts := resticbench.RunOpts{Host: host, SSHIdentity: o.sshIdentity, AgentBin: o.agentBin, Config: cfg, Out: outPath, Summary: f.IO.Out}
	if o.fromHere {
		_, err = resticbench.RunHere(ctx, opts)
	} else {
		_, err = resticbench.Run(ctx, opts)
	}
	return err
}

func (o *options) buildConfig(defaultPhases []string) (resticbench.Config, error) {
	cfg := resticbench.Config{
		Workdir:         o.workdir,
		ReadConcurrency: o.readConc,
		PackSizeMiB:     o.packSizeMiB,
		Compression:     o.compression,
		Incrementals:    o.incrementals,
		MutatePercent:   o.mutatePercent,
		Label:           o.label,
		Tag:             "yucca-bench",
		KeepData:        o.keepData,
		Seed:            o.seed,
		Phases:          defaultPhases,
	}
	if cfg.Label == "" {
		cfg.Label = "run"
	}

	cfg.Repo = o.repo
	if cfg.Repo == "" && o.repoID == "" {
		cfg.Repo = os.Getenv("RESTIC_REPOSITORY")
	}
	if o.passwordFile != "" {
		b, err := os.ReadFile(o.passwordFile)
		if err != nil {
			return cfg, err
		}
		cfg.Password = strings.TrimSpace(string(b))
	} else {
		cfg.Password = os.Getenv("RESTIC_PASSWORD")
	}

	if o.size != "" {
		size, err := resticbench.ParseSize(o.size)
		if err != nil {
			return cfg, err
		}
		cfg.Size = size
		fileSize, err := resticbench.ParseSize(o.fileSize)
		if err != nil {
			return cfg, err
		}
		cfg.FileSize = fileSize
	}

	if o.connections != "" {
		for s := range strings.SplitSeq(o.connections, ",") {
			n, err := strconv.Atoi(strings.TrimSpace(s))
			if err != nil || n < 1 {
				return cfg, fmt.Errorf("invalid --connections value %q", s)
			}
			cfg.Connections = append(cfg.Connections, n)
		}
	}

	if o.phases != "" {
		cfg.Phases = strings.Split(o.phases, ",")
	}
	if o.cleanup && !cfg.HasPhase(resticbench.PhaseCleanup) {
		cfg.Phases = append(cfg.Phases, resticbench.PhaseCleanup)
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
