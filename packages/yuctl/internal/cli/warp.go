package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yuctl/internal/warp"
)

type warpFlags struct {
	namespace   string
	kubeconfig  string
	cephCluster string
	s3Endpoint  string
	insecure    bool
}

func (f *warpFlags) register(c *cobra.Command) {
	c.PersistentFlags().StringVar(&f.namespace, "namespace", "loadtest", "namespace for the runner fleet")
	c.PersistentFlags().StringVar(&f.kubeconfig, "kubeconfig", "", "kubeconfig path (default: materialized from discovery via 1Password)")
	c.PersistentFlags().StringVar(&f.cephCluster, "ceph-cluster", "", "target ceph cluster (default: the selected one, or the region's only one)")
	c.PersistentFlags().StringVar(&f.s3Endpoint, "s3-endpoint", "", "override the RGW S3 endpoint from discovery")
	c.PersistentFlags().BoolVar(&f.insecure, "insecure", true, "skip RGW TLS verification (self-signed certs)")
}

// session resolves context + topology and opens a warp session against the
// region's K8s cluster and chosen ceph cluster. The label describes the target
// for display ("prod@htz-fsn1 → spice · father").
func (f *warpFlags) session(ctx context.Context) (*warp.Session, string, error) {
	cc, err := requireContext()
	if err != nil {
		return nil, "", err
	}
	topo, err := resolveTopology(ctx)
	if err != nil {
		return nil, "", err
	}
	k8s := topo.Kubernetes(cc.Partition, cc.Region)
	if k8s == nil {
		return nil, "", fmt.Errorf("no kubernetes payload in discovery for %s@%s", cc.Partition, cc.Region)
	}
	clusters := topo.CephClusters(cc.Partition, cc.Region)
	name := f.cephCluster
	if name == "" {
		name = cc.CephCluster
	}
	if name == "" {
		if len(clusters) != 1 {
			return nil, "", fmt.Errorf("region has %d ceph clusters (%s); `yuctl ceph select` or --ceph-cluster",
				len(clusters), strings.Join(cephClusterNames(clusters), ", "))
		}
		for n := range clusters {
			name = n
		}
	}
	ceph, ok := clusters[name]
	if !ok {
		return nil, "", fmt.Errorf("unknown ceph cluster %q in %s@%s; known: %s",
			name, cc.Partition, cc.Region, strings.Join(cephClusterNames(clusters), ", "))
	}
	label := fmt.Sprintf("%s@%s → %s · %s", cc.Partition, cc.Region, name, k8s.ClusterName)
	s, err := warp.NewSession(ctx, *k8s, ceph, f.namespace, f.kubeconfig)
	return s, label, err
}

func newWarpCmd() *cobra.Command {
	f := &warpFlags{}
	cmd := &cobra.Command{
		Use:   "warp",
		Short: "S3 load testing against the region's RGW fleet (MinIO warp)",
		Long: "Deploys hostNetwork warp runner pods on the selected region's workers and\n" +
			"drives sustained PUT/GET load against the ceph cluster's RGW gateways,\n" +
			"round-robining every request over the live endpoint roster. Topology\n" +
			"(workers, CPU, RGW IPs, replica count) is discovered at runtime; defaults\n" +
			"reproduce the proven ~250Gbps father configuration per pod.",
	}
	f.register(cmd)
	cmd.AddCommand(
		newWarpDeployCmd(f),
		newWarpStartCmd(f),
		newWarpStatusCmd(f),
		newWarpWatchCmd(f),
		newWarpStopCmd(f),
		newWarpCleanupCmd(f),
		newWarpUndeployCmd(f),
	)
	return cmd
}

func warpDeployFlags(c *cobra.Command, o *warp.DeployOptions) {
	c.Flags().StringVar(&o.Image, "image", "minio/warp:latest", "warp container image")
	c.Flags().IntVar(&o.PodsPerNode, "pods-per-node", 2, "runner pods per worker node")
	c.Flags().IntVar(&o.WorkerCount, "workers", 0, "use only the first N workers (0 = all)")
	c.Flags().IntVar(&o.CPURequest, "cpu", 0, "CPU cores requested per pod (0 = derive from node allocatable)")
	c.Flags().StringVar(&o.SourceNS, "creds-namespace", "yucca", "namespace of the S3 creds source secret")
	c.Flags().StringVar(&o.SourceSecret, "creds-secret", "yucca-michael", "secret holding the RGW access/secret keys")
}

func newWarpDeployCmd(f *warpFlags) *cobra.Command {
	o := warp.DeployOptions{}
	cmd := &cobra.Command{
		Use:   "deploy",
		Short: "Deploy (or converge) the runner fleet on the region's workers",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			return s.Deploy(cmd.Context(), o)
		},
	}
	warpDeployFlags(cmd, &o)
	return cmd
}

func newWarpStartCmd(f *warpFlags) *cobra.Command {
	o := warp.StartOptions{}
	d := warp.DeployOptions{}
	var autoDeploy bool
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start (or gracefully restart) the load on the deployed runners",
		Long: "Launches warp on every runner pod, killing any previous load first — so a\n" +
			"second start is a graceful restart with the new parameters. Without\n" +
			"--duration the load runs non-stop (a respawning loop of --cycle runs,\n" +
			"accumulating data until `warp cleanup`). Stream defaults scale with the\n" +
			"topology: 167 PUT + 17 GET per pod of 16MiB objects — on 3 workers x 2 pods\n" +
			"that is the proven 1002/102 ~250Gbps shape.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			s, _, err := f.session(ctx)
			if err != nil {
				return err
			}
			o.Insecure = f.insecure
			o.S3Override = f.s3Endpoint
			if autoDeploy {
				if pods, err := s.RunnerPods(ctx); err == nil && len(pods) == 0 {
					if err := s.Deploy(ctx, d); err != nil {
						return err
					}
				}
			}
			return s.Start(ctx, o)
		},
	}
	cmd.Flags().IntVar(&o.TotalPutStreams, "put-streams", 0, "total concurrent PUT streams across the fleet (0 = 167 per pod)")
	cmd.Flags().IntVar(&o.TotalGetStreams, "get-streams", 0, "total concurrent GET streams across the fleet (0 = 17 per pod, -1 = none)")
	cmd.Flags().IntVar(&o.PutPerPod, "put-per-pod", 0, "PUT concurrency per pod (overrides --put-streams)")
	cmd.Flags().IntVar(&o.GetPerPod, "get-per-pod", 0, "GET concurrency per pod (overrides --get-streams)")
	cmd.Flags().StringVar(&o.PutObjSize, "put-obj-size", "16MiB", "PUT object size (restic pack sized)")
	cmd.Flags().StringVar(&o.GetObjSize, "get-obj-size", "16MiB", "GET object size (small sizes are latency-bound under write load)")
	cmd.Flags().IntVar(&o.GetObjects, "get-objects", 1000, "GET corpus objects per pod per cycle")
	cmd.Flags().StringVar(&o.Duration, "duration", "", "bounded run length (e.g. 2h); empty = non-stop until `warp stop`")
	cmd.Flags().StringVar(&o.CycleDuration, "cycle", "6h", "warp run length inside the non-stop loop")
	cmd.Flags().StringVar(&o.BucketPrefix, "bucket-prefix", "yuctl-warp-", "bucket name prefix (cleanup purges by this)")
	cmd.Flags().BoolVar(&autoDeploy, "auto-deploy", true, "deploy the runner fleet first if it is missing")
	warpDeployFlags(cmd, &d)
	return cmd
}

func newWarpStatusCmd(f *warpFlags) *cobra.Command {
	var sample int
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show per-pod load state and per-node NIC throughput",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, label, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			log.Info().Int("window_s", sample).Msg("sampling pods and NIC counters")
			report, err := s.Status(cmd.Context(), sample)
			if err != nil {
				return err
			}
			v := &warpView{label: label}
			fmt.Fprintln(cmd.OutOrStdout(), v.render(report, time.Now(), sample, false))
			return nil
		},
	}
	cmd.Flags().IntVar(&sample, "sample", 5, "NIC sampling window in seconds")
	return cmd
}

func newWarpWatchCmd(f *warpFlags) *cobra.Command {
	var sample int
	cmd := &cobra.Command{
		Use:   "watch",
		Short: "Live dashboard: continuously sampled load state and throughput",
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

			v := &warpView{label: label}
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
				for _, n := range report.Nodes {
					combined += n.TxBps + n.RxBps
				}
				if len(report.Nodes) > 0 {
					v.push(combined)
				}
				fmt.Fprintln(out, v.render(report, time.Now(), sample, true))
			}
		},
	}
	cmd.Flags().IntVar(&sample, "sample", 5, "NIC sampling window per refresh in seconds")
	return cmd
}

func newWarpStopCmd(f *warpFlags) *cobra.Command {
	return &cobra.Command{
		Use:   "stop",
		Short: "Stop the load everywhere (runners stay deployed for instant restart)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			return s.Stop(cmd.Context())
		},
	}
}

func newWarpCleanupCmd(f *warpFlags) *cobra.Command {
	o := warp.CleanupOptions{}
	var timeout time.Duration
	cmd := &cobra.Command{
		Use:   "cleanup",
		Short: "Purge warp test buckets via an in-cluster mc Job",
		Long: "Deletes every bucket matching the configured prefixes through a hostNetwork\n" +
			"Job inside the cluster (the RGW IPs are fabric-internal). Refuses to run\n" +
			"while load is active unless --force. Note: a mass delete is itself a load\n" +
			"event — RGW garbage collection churns for a while afterwards.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, _, err := f.session(cmd.Context())
			if err != nil {
				return err
			}
			o.Insecure = f.insecure
			o.S3Override = f.s3Endpoint
			o.Timeout = timeout
			return s.Cleanup(cmd.Context(), o)
		},
	}
	cmd.Flags().StringSliceVar(&o.Prefixes, "prefix", []string{"yuctl-warp-"}, "bucket prefixes to purge")
	cmd.Flags().BoolVar(&o.Legacy, "legacy", false, "also purge the pre-yuctl soak prefixes (warp-lt-, warp-loadtest-)")
	cmd.Flags().StringVar(&o.Image, "mc-image", "minio/mc:latest", "mc container image for the cleanup Job")
	cmd.Flags().BoolVar(&o.Force, "force", false, "purge even while load is running")
	cmd.Flags().BoolVar(&o.Keep, "keep-job", false, "keep the finished Job for inspection")
	cmd.Flags().DurationVar(&timeout, "timeout", 30*time.Minute, "how long to wait for the purge to finish")
	return cmd
}

func newWarpUndeployCmd(f *warpFlags) *cobra.Command {
	var force bool
	cmd := &cobra.Command{
		Use:   "undeploy",
		Short: "Delete the runner fleet and its namespace entirely",
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
