package cli

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
	"yuctl/internal/bench"
	"yuctl/internal/benchdo"
)

// benchDoFlags are shared by every bench-do subcommand.
type benchDoFlags struct {
	yes bool
}

func (f *benchDoFlags) register(c *cobra.Command) {
	c.PersistentFlags().BoolVar(&f.yes, "yes", false, "skip the droplet-creation confirmation prompt")
}

// session opens the fleet session for the selected partition. The label
// describes the target for display ("prod · yuctl-bench-do-prod").
func (f *benchDoFlags) session(ctx context.Context) (*benchdo.Session, string, error) {
	cc, err := requireContext()
	if err != nil {
		return nil, "", err
	}
	s, err := benchdo.NewSession(ctx, cc.Partition)
	if err != nil {
		return nil, "", err
	}
	return s, cc.Partition + " · " + s.Tag(), nil
}

// minter runs the admin-api login flow and returns the repo-minting client.
func (f *benchDoFlags) minter(ctx context.Context, cmd *cobra.Command, admin *adminFlags) (benchdo.RepoMinter, error) {
	cc, err := requireContext()
	if err != nil {
		return nil, err
	}
	// Topology is only needed to derive the admin URL; an explicit --admin-url
	// or $YUCTL_ADMIN_API_URL skips state access entirely.
	var client *adminapi.Client
	if admin.adminURL == "" && os.Getenv("YUCTL_ADMIN_API_URL") == "" {
		topo, err := resolveTopology(ctx)
		if err != nil {
			return nil, err
		}
		client, _, err = admin.adminLogin(ctx, cmd, cc, topo)
		if err != nil {
			return nil, err
		}
	} else {
		client, _, err = admin.adminLogin(ctx, cmd, cc, nil)
		if err != nil {
			return nil, err
		}
	}
	return client, nil
}

// confirm returns the deploy confirmation callback: nil with --yes, otherwise
// an interactive y/N prompt on the terminal.
func (f *benchDoFlags) confirm(cmd *cobra.Command) func(string) bool {
	if f.yes {
		return nil
	}
	return func(plan string) bool {
		out := cmd.ErrOrStderr()
		fmt.Fprintln(out, "\nbench-do will "+plan)
		fmt.Fprint(out, "\nProceed? [y/N] ")
		sc := bufio.NewScanner(cmd.InOrStdin())
		if !sc.Scan() {
			return false
		}
		answer := strings.ToLower(strings.TrimSpace(sc.Text()))
		return answer == "y" || answer == "yes"
	}
}

func newBenchDoCmd() *cobra.Command {
	f := &benchDoFlags{}
	cmd := &cobra.Command{
		Use:   "bench-do",
		Short: "Restic client fleet on DigitalOcean droplets writing against michael",
		Long: "Deploys a fleet of DigitalOcean droplets (project yucca-bench, per-fleet\n" +
			"ephemeral ssh key) and runs real restic clients on them — the external-user\n" +
			"path over the public internet into michael. Each client loops seeded\n" +
			"generate→backup cycles against its own admin-api-minted repository at a\n" +
			"chosen pack (object) size. Every droplet's agent hard-stops at the size's\n" +
			"transfer allowance so a forgotten run cannot burn into paid overage.",
	}
	f.register(cmd)
	cmd.AddCommand(
		newBenchDoDeployCmd(f),
		newBenchDoStartCmd(f),
		newBenchDoStatusCmd(f),
		newBenchDoWatchCmd(f),
		newBenchDoStopCmd(f),
		newBenchDoCleanupCmd(f),
		newBenchDoUndeployCmd(f),
	)
	return cmd
}

func benchDoDeployFlags(c *cobra.Command, o *benchdo.DeployOptions) {
	c.Flags().IntVar(&o.Droplets, "droplets", 3, "fleet size")
	c.Flags().StringSliceVar(&o.Regions, "do-region", []string{"fra1", "ams3", "lon1", "nyc3"}, "DO regions, round-robined across the fleet")
	c.Flags().StringVar(&o.Size, "do-size", "s-2vcpu-4gb", "droplet size slug")
	c.Flags().StringVar(&o.Image, "image", "ubuntu-24-04-x64", "droplet image slug")
	c.Flags().StringVar(&o.AgentBin, "agent-bin", "", "local linux/amd64 bench-agent binary (default: the embedded one)")
}

func newBenchDoDeployCmd(f *benchDoFlags) *cobra.Command {
	o := benchdo.DeployOptions{}
	cmd := &cobra.Command{
		Use:   "deploy",
		Short: "Create (or converge) the droplet fleet and push the agent + restic",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			o.Confirm = f.confirm(cmd)
			return s.Deploy(cmd.Context(), o)
		},
	}
	benchDoDeployFlags(cmd, &o)
	return cmd
}

func newBenchDoStartCmd(f *benchDoFlags) *cobra.Command {
	admin := &adminFlags{}
	d := benchdo.DeployOptions{}
	var (
		objSize     string
		cycleSize   string
		fileSize    string
		duration    string
		maxTransfer string
		autoDeploy  bool
	)
	o := benchdo.StartOptions{}
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start (or gracefully restart) the restic load on the fleet",
		Long: "Ensures one repository per client (admin-api; `yuctl login` session), mints\n" +
			"fresh restic URLs, and launches the detached load supervisor on every\n" +
			"droplet. A second start kills the previous load first and relaunches with\n" +
			"the new parameters. The load ends when --duration elapses, the per-droplet\n" +
			"transfer cap is hit, or `bench-do stop`.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			var err error
			if o.PackSizeMiB, err = parseMiB(objSize, "--obj-size"); err != nil {
				return err
			}
			if o.CycleSize, err = bench.ParseSize(cycleSize); err != nil {
				return err
			}
			if o.FileSize, err = bench.ParseSize(fileSize); err != nil {
				return err
			}
			if duration != "" && duration != "0" {
				dur, err := time.ParseDuration(duration)
				if err != nil {
					return fmt.Errorf("invalid --duration %q", duration)
				}
				o.Duration = dur
			}
			if maxTransfer != "" {
				if o.MaxTransfer, err = bench.ParseSize(maxTransfer); err != nil {
					return err
				}
			}

			s, _, err := f.session(ctx)
			if err != nil {
				return err
			}
			if autoDeploy {
				if droplets, err := s.Droplets(ctx); err == nil && len(droplets) == 0 {
					d.Confirm = f.confirm(cmd)
					if err := s.Deploy(ctx, d); err != nil {
						return err
					}
				}
			}
			minter, err := f.minter(ctx, cmd, admin)
			if err != nil {
				return err
			}
			return s.Start(ctx, minter, o)
		},
	}
	cmd.Flags().IntVar(&o.ClientsPerDroplet, "clients-per-droplet", 1, "restic clients per droplet (each with its own repository)")
	cmd.Flags().StringVar(&objSize, "obj-size", "16MiB", "restic pack size — the object size michael sees (4..128 MiB)")
	cmd.Flags().StringVar(&cycleSize, "size", "8GiB", "dataset per client per cycle (freshly seeded every cycle)")
	cmd.Flags().StringVar(&fileSize, "file-size", "64MiB", "size of each generated file")
	cmd.Flags().IntVar(&o.Connections, "connections", 5, "rest.connections per client")
	cmd.Flags().IntVar(&o.ReadConcurrency, "read-concurrency", 4, "restic backup read concurrency")
	cmd.Flags().StringVar(&o.Compression, "compression", "off", "restic compression (bench data is incompressible)")
	cmd.Flags().StringVar(&duration, "duration", "1h", "run length (e.g. 2h; 0 = non-stop until bench-do stop)")
	cmd.Flags().StringVar(&maxTransfer, "max-transfer", "", "per-droplet wire-TX cap (default: the droplet size's transfer allowance)")
	cmd.Flags().StringVar(&o.Label, "label", "run", "label stored in the results")
	cmd.Flags().Uint64Var(&o.Seed, "seed", 0, "dataset seed (0 = random)")
	cmd.Flags().BoolVar(&autoDeploy, "auto-deploy", true, "deploy the fleet first if it is missing (asks before creating droplets)")
	benchDoDeployFlags(cmd, &d)
	admin.register(cmd)
	return cmd
}

func parseMiB(v, flag string) (int, error) {
	n, err := bench.ParseSize(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", flag, err)
	}
	if n%(1<<20) != 0 {
		return 0, fmt.Errorf("%s must be a whole number of MiB", flag)
	}
	return int(n >> 20), nil
}

func newBenchDoStatusCmd(f *benchDoFlags) *cobra.Command {
	var sample int
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show per-droplet load state, throughput, and transfer budget",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, label, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			log.Info().Int("window_s", sample).Msg("sampling droplets")
			report, err := s.Status(cmd.Context(), sample)
			if err != nil {
				return err
			}
			v := &benchDoView{label: label}
			fmt.Fprintln(cmd.OutOrStdout(), v.render(report, time.Now(), sample, false))
			return nil
		},
	}
	cmd.Flags().IntVar(&sample, "sample", 5, "NIC sampling window in seconds")
	return cmd
}

func newBenchDoWatchCmd(f *benchDoFlags) *cobra.Command {
	var sample int
	cmd := &cobra.Command{
		Use:   "watch",
		Short: "Live dashboard: continuously sampled fleet state and throughput",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			s, label, err := f.session(ctx)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			fmt.Fprint(out, "\x1b[?1049h\x1b[?25l") // alt screen, hide cursor
			defer fmt.Fprint(out, "\x1b[?25h\x1b[?1049l")
			fmt.Fprintf(out, "%s connecting · sampling %ds window…\n", label, sample)

			v := &benchDoView{label: label}
			for {
				report, err := s.Status(ctx, sample)
				if ctx.Err() != nil {
					return nil
				}
				fmt.Fprint(out, "\x1b[H\x1b[2J")
				if err != nil {
					fmt.Fprintf(out, "status error (retrying): %v\n", err)
					select {
					case <-ctx.Done():
						return nil
					case <-time.After(3 * time.Second):
					}
					continue
				}
				var combined float64
				for _, d := range report.Droplets {
					combined += d.TxBps
				}
				if len(report.Droplets) > 0 {
					v.push(combined)
				}
				fmt.Fprintln(out, v.render(report, time.Now(), sample, true))
			}
		},
	}
	cmd.Flags().IntVar(&sample, "sample", 5, "NIC sampling window per refresh in seconds")
	return cmd
}

func newBenchDoStopCmd(f *benchDoFlags) *cobra.Command {
	var out string
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Stop the load everywhere and save the results JSON (droplets stay)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			res, err := s.Stop(cmd.Context())
			if err != nil || res == nil {
				return err
			}
			if out == "" {
				out = fmt.Sprintf("bench-do-%s-%s.json", res.Label, time.Now().Format("20060102-150405"))
			}
			if err := saveBenchDoResult(out, res); err != nil {
				return err
			}
			log.Info().Str("path", out).Msg("results saved")
			renderBenchDoResult(cmd.OutOrStdout(), res)
			return nil
		},
	}
	cmd.Flags().StringVar(&out, "out", "", "local results file (default bench-do-<label>-<timestamp>.json)")
	return cmd
}

func newBenchDoCleanupCmd(f *benchDoFlags) *cobra.Command {
	admin := &adminFlags{}
	var force bool
	cmd := &cobra.Command{
		Use:   "cleanup",
		Short: "Forget and prune every bench-do snapshot (run before undeploy)",
		Long: "Runs restic forget+prune for every client repository, from its droplet —\n" +
			"the repos themselves persist (admin-api deletion is unimplemented) but end\n" +
			"~empty. Needs the fleet still deployed and a `yuctl login` session.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			s, _, err := f.session(ctx)
			if err != nil {
				return err
			}
			minter, err := f.minter(ctx, cmd, admin)
			if err != nil {
				return err
			}
			return s.Cleanup(ctx, minter, force)
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "clean even while load is running")
	admin.register(cmd)
	return cmd
}

func newBenchDoUndeployCmd(f *benchDoFlags) *cobra.Command {
	var force bool
	cmd := &cobra.Command{
		Use:   "undeploy",
		Short: "Destroy every fleet droplet and the ephemeral ssh key",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			return s.Undeploy(cmd.Context(), force)
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "undeploy even while load is running")
	return cmd
}
