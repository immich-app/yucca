package fleetbench

import (
	"bufio"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yuctl/cmdutil"
	"yuctl/fleet"
	fbfleet "yuctl/fleet/fleetbench"
	"yuctl/provider"
	"yuctl/resticbench"
)

// flags are shared by every fleet-bench subcommand.
type flags struct {
	yes      bool
	provider string
}

func (o *flags) register(c *cobra.Command) {
	c.PersistentFlags().BoolVar(&o.yes, "yes", false, "skip the host-creation confirmation prompt")
	c.PersistentFlags().StringVar(&o.provider, "provider", "do", "cloud provider for this fleet ("+strings.Join(provider.Names(), " | ")+")")
}

// session opens the fleet session for the selected partition + provider. The
// label describes the target for display ("prod · yuctl-bench-do-prod").
func (o *flags) session(ctx context.Context, f *cmdutil.Factory) (*fbfleet.Session, string, error) {
	cc, err := f.Context()
	if err != nil {
		return nil, "", err
	}
	s, err := fbfleet.NewSession(ctx, cc.Partition, o.provider)
	if err != nil {
		return nil, "", err
	}
	return s, cc.Partition + " · " + s.Tag(), nil
}

// minter runs the admin-api login flow and returns the repo-minting client.
func (o *flags) minter(ctx context.Context, f *cmdutil.Factory, admin *cmdutil.AdminFlags) (fbfleet.RepoMinter, error) {
	cc, err := f.Context()
	if err != nil {
		return nil, err
	}
	topo, err := admin.OptionalTopology(ctx, f)
	if err != nil {
		return nil, err
	}
	client, _, err := admin.Login(ctx, f, cc, topo)
	if err != nil {
		return nil, err
	}
	return client, nil
}

// confirm returns the deploy confirmation callback: nil with --yes, otherwise
// an interactive y/N prompt on the terminal.
func (o *flags) confirm(f *cmdutil.Factory) func(string) bool {
	if o.yes {
		return nil
	}
	return func(plan string) bool {
		fmt.Fprintln(f.IO.Err, "\nfleet-bench will "+plan)
		fmt.Fprint(f.IO.Err, "\nProceed? [y/N] ")
		sc := bufio.NewScanner(f.IO.In)
		if !sc.Scan() {
			return false
		}
		answer := strings.ToLower(strings.TrimSpace(sc.Text()))
		return answer == "y" || answer == "yes"
	}
}

func New(f *cmdutil.Factory) *cobra.Command {
	o := &flags{}
	cmd := &cobra.Command{
		Use:   "fleet-bench",
		Short: "Restic client fleet across cloud providers writing against michael",
		Long: "Deploys a fleet of cloud VMs on a chosen --provider (DigitalOcean, Hetzner;\n" +
			"OVH later) with a per-fleet ephemeral ssh key and runs real restic clients\n" +
			"on them — the external-user path over the public internet into michael. Each\n" +
			"client loops seeded generate→backup cycles against its own admin-api-minted\n" +
			"repository at a chosen pack (object) size. Every host's agent hard-stops at\n" +
			"the size's transfer allowance so a forgotten run cannot burn into paid\n" +
			"overage. Fleets are per provider × partition, so several providers can load\n" +
			"michael at once (run deploy/start per --provider).",
	}
	o.register(cmd)
	cmd.AddCommand(
		newDeployCmd(f, o),
		newStartCmd(f, o),
		newStatusCmd(f, o),
		newWatchCmd(f, o),
		newStopCmd(f, o),
		newCleanupCmd(f, o),
		newUndeployCmd(f, o),
	)
	return cmd
}

func deployFlags(c *cobra.Command, o *fbfleet.DeployOptions) {
	c.Flags().IntVar(&o.Hosts, "hosts", 3, "fleet size")
	c.Flags().StringSliceVar(&o.Regions, "region", nil, "regions, round-robined across the fleet (default: the provider's)")
	c.Flags().StringVar(&o.Size, "size", "", "instance size slug (default: the provider's)")
	c.Flags().StringVar(&o.Image, "image", "", "image slug (default: the provider's)")
	c.Flags().StringVar(&o.AgentBin, "agent-bin", "", "local linux/amd64 bench-agent binary (default: the embedded one)")
}

func newDeployCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	o := fbfleet.DeployOptions{}
	cmd := &cobra.Command{
		Use:   "deploy",
		Short: "Create (or converge) the host fleet and push the agent + restic",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := fl.session(cmd.Context(), f)
			if err != nil {
				return err
			}
			o.Confirm = fl.confirm(f)
			return s.Deploy(cmd.Context(), o)
		},
	}
	deployFlags(cmd, &o)
	return cmd
}

func newStartCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	d := fbfleet.DeployOptions{}
	var (
		objSize     string
		cycleSize   string
		fileSize    string
		duration    string
		maxTransfer string
		autoDeploy  bool
	)
	o := fbfleet.StartOptions{}
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start (or gracefully restart) the restic load on the fleet",
		Long: "Ensures one repository per client (admin-api; `yuctl login` session), mints\n" +
			"fresh restic URLs, and launches the detached load supervisor on every\n" +
			"host. A second start kills the previous load first and relaunches with\n" +
			"the new parameters. The load ends when --duration elapses, the per-host\n" +
			"transfer cap is hit, or `fleet-bench stop`.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			var err error
			if o.PackSizeMiB, err = parseMiB(objSize, "--obj-size"); err != nil {
				return err
			}
			if o.CycleSize, err = resticbench.ParseSize(cycleSize); err != nil {
				return err
			}
			if o.FileSize, err = resticbench.ParseSize(fileSize); err != nil {
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
				if o.MaxTransfer, err = resticbench.ParseSize(maxTransfer); err != nil {
					return err
				}
			}

			s, _, err := fl.session(ctx, f)
			if err != nil {
				return err
			}
			if autoDeploy {
				if hosts, err := s.Hosts(ctx); err == nil && len(hosts) == 0 {
					d.Confirm = fl.confirm(f)
					if err := s.Deploy(ctx, d); err != nil {
						return err
					}
				}
			}
			minter, err := fl.minter(ctx, f, admin)
			if err != nil {
				return err
			}
			return s.Start(ctx, minter, o)
		},
	}
	cmd.Flags().IntVar(&o.ClientsPerHost, "clients-per-host", 1, "restic clients per host (each with its own repository)")
	cmd.Flags().StringVar(&objSize, "obj-size", "16MiB", "restic pack size — the object size michael sees (4..128 MiB)")
	cmd.Flags().StringVar(&cycleSize, "cycle-size", "8GiB", "dataset per client per cycle (freshly seeded every cycle)")
	cmd.Flags().StringVar(&fileSize, "file-size", "64MiB", "size of each generated file")
	cmd.Flags().IntVar(&o.Connections, "connections", 5, "rest.connections per client")
	cmd.Flags().IntVar(&o.ReadConcurrency, "read-concurrency", 4, "restic backup read concurrency")
	cmd.Flags().StringVar(&o.Compression, "compression", "off", "restic compression (bench data is incompressible)")
	cmd.Flags().StringVar(&duration, "duration", "1h", "run length (e.g. 2h; 0 = non-stop until fleet-bench stop)")
	cmd.Flags().StringVar(&maxTransfer, "max-transfer", "", "per-host wire-TX cap (default: the host size's transfer allowance)")
	cmd.Flags().StringVar(&o.Label, "label", "run", "label stored in the results")
	cmd.Flags().Uint64Var(&o.Seed, "seed", 0, "dataset seed (0 = random)")
	cmd.Flags().BoolVar(&autoDeploy, "auto-deploy", true, "deploy the fleet first if it is missing (asks before creating hosts)")
	deployFlags(cmd, &d)
	admin.Register(cmd)
	return cmd
}

func parseMiB(v, flag string) (int, error) {
	n, err := resticbench.ParseSize(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", flag, err)
	}
	if n%(1<<20) != 0 {
		return 0, fmt.Errorf("%s must be a whole number of MiB", flag)
	}
	return int(n >> 20), nil
}

func newStatusCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	var sample int
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show per-host load state, throughput, and transfer budget",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, label, err := fl.session(cmd.Context(), f)
			if err != nil {
				return err
			}
			log.Info().Int("window_s", sample).Msg("sampling hosts")
			report, err := s.Status(cmd.Context(), sample)
			if err != nil {
				return err
			}
			v := &view{label: label}
			fmt.Fprintln(f.IO.Out, v.render(report, time.Now(), sample, false))
			return nil
		},
	}
	cmd.Flags().IntVar(&sample, "sample", 5, "NIC sampling window in seconds")
	return cmd
}

func newWatchCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	var sample int
	cmd := &cobra.Command{
		Use:   "watch",
		Short: "Live dashboard: continuously sampled fleet state and throughput",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, label, err := fl.session(cmd.Context(), f)
			if err != nil {
				return err
			}
			v := &view{label: label}
			return fleet.Watch(cmd.Context(), f.IO.Out, label, sample, func(ctx context.Context) (string, error) {
				report, err := s.Status(ctx, sample)
				if err != nil {
					return "", err
				}
				var combined float64
				for _, d := range report.Hosts {
					combined += d.TxBps
				}
				if len(report.Hosts) > 0 {
					v.history.Push(combined)
				}
				return v.render(report, time.Now(), sample, true), nil
			})
		},
	}
	cmd.Flags().IntVar(&sample, "sample", 5, "NIC sampling window per refresh in seconds")
	return cmd
}

func newStopCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	var out string
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Stop the load everywhere and save the results JSON (hosts stay)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := fl.session(cmd.Context(), f)
			if err != nil {
				return err
			}
			res, err := s.Stop(cmd.Context())
			if err != nil || res == nil {
				return err
			}
			if out == "" {
				out = fmt.Sprintf("fleet-bench-%s-%s.json", res.Label, time.Now().Format("20060102-150405"))
			}
			if err := fbfleet.SaveResult(out, res); err != nil {
				return err
			}
			log.Info().Str("path", out).Msg("results saved")
			fbfleet.RenderResult(f.IO.Out, res)
			return nil
		},
	}
	cmd.Flags().StringVar(&out, "out", "", "local results file (default fleet-bench-<label>-<timestamp>.json)")
	return cmd
}

func newCleanupCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var force bool
	cmd := &cobra.Command{
		Use:   "cleanup",
		Short: "Forget and prune every fleet-bench snapshot (run before undeploy)",
		Long: "Runs restic forget+prune for every client repository, from its host —\n" +
			"the repos themselves persist (admin-api deletion is unimplemented) but end\n" +
			"~empty. Needs the fleet still deployed and a `yuctl login` session.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			s, _, err := fl.session(ctx, f)
			if err != nil {
				return err
			}
			minter, err := fl.minter(ctx, f, admin)
			if err != nil {
				return err
			}
			return s.Cleanup(ctx, minter, force)
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "clean even while load is running")
	admin.Register(cmd)
	return cmd
}

func newUndeployCmd(f *cmdutil.Factory, fl *flags) *cobra.Command {
	var force bool
	cmd := &cobra.Command{
		Use:   "undeploy",
		Short: "Destroy every fleet host and the ephemeral ssh key",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := fl.session(cmd.Context(), f)
			if err != nil {
				return err
			}
			return s.Undeploy(cmd.Context(), force)
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "undeploy even while load is running")
	return cmd
}
