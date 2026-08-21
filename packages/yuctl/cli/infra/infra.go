package infra

import (
	"fmt"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yuctl/cmdutil"
	"yuctl/talos"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "infra",
		Short: "Infrastructure / node operations for the active region",
	}
	cmd.AddCommand(newTalosCmd(f))
	return cmd
}

func newTalosCmd(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "talos",
		Short: "Talos node operations",
	}
	cmd.AddCommand(newTalosUpgradeCmd(f))
	return cmd
}

func newTalosUpgradeCmd(f *cmdutil.Factory) *cobra.Command {
	var (
		image  string
		dryRun bool
		yes    bool
	)
	c := &cobra.Command{
		Use:   "upgrade",
		Short: "Upgrade Talos on the active region's control-plane nodes",
		Long: "Resolve the region's talosconfig (1Password) and run `talosctl upgrade`\n" +
			"against each control-plane node IP from discovery. Gated behind a confirm\n" +
			"prompt unless --yes; use --dry-run to print the commands without running.",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			cc, err := f.Context()
			if err != nil {
				return err
			}
			topo, err := f.Topology(ctx)
			if err != nil {
				return err
			}
			kube := topo.Kubernetes(cc.Partition, cc.Region)
			if kube == nil {
				return fmt.Errorf("no kubernetes/talos discovery payload for %s@%s", cc.Partition, cc.Region)
			}

			out := f.IO.Out
			fmt.Fprintf(out, "Talos upgrade target: %s@%s (cluster %s)\n", cc.Partition, cc.Region, kube.ClusterName)
			fmt.Fprintf(out, "control-plane nodes:  %s\n", strings.Join(kube.CPNodeIPs, ", "))
			if image != "" {
				fmt.Fprintf(out, "installer image:      %s\n", image)
			}

			if !dryRun && !yes {
				if !cmdutil.Confirm(f.IO, fmt.Sprintf("Upgrade Talos on %d node(s) in %s@%s?", len(kube.CPNodeIPs), cc.Partition, cc.Region)) {
					fmt.Fprintln(out, "aborted")
					return nil
				}
			}

			return talos.Upgrade(ctx, *kube, talos.UpgradeOptions{
				Image:  image,
				DryRun: dryRun,
			}, log.Logger)
		},
	}
	c.Flags().StringVar(&image, "image", "", "target Talos installer image (passed to talosctl --image)")
	c.Flags().BoolVar(&dryRun, "dry-run", false, "print the talosctl commands without executing them")
	c.Flags().BoolVar(&yes, "yes", false, "skip the confirmation prompt")
	return c
}
