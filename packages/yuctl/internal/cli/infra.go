package cli

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yuctl/internal/k8s"
)

func newInfraCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "infra",
		Short: "Infrastructure / node operations for the active region",
	}
	cmd.AddCommand(newInfraTalosCmd())
	return cmd
}

func newInfraTalosCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "talos",
		Short: "Talos node operations",
	}
	cmd.AddCommand(newInfraTalosUpgradeCmd())
	return cmd
}

func newInfraTalosUpgradeCmd() *cobra.Command {
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
			cc, err := requireContext()
			if err != nil {
				return err
			}
			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}
			kube := topo.Kubernetes(cc.Partition, cc.Region)
			if kube == nil {
				return fmt.Errorf("no kubernetes/talos discovery payload for %s@%s", cc.Partition, cc.Region)
			}

			out := cmd.OutOrStdout()
			fmt.Fprintf(out, "Talos upgrade target: %s@%s (cluster %s)\n", cc.Partition, cc.Region, kube.ClusterName)
			fmt.Fprintf(out, "control-plane nodes:  %s\n", strings.Join(kube.CPNodeIPs, ", "))
			if image != "" {
				fmt.Fprintf(out, "installer image:      %s\n", image)
			}

			if !dryRun && !yes {
				if !confirm(fmt.Sprintf("Upgrade Talos on %d node(s) in %s@%s?", len(kube.CPNodeIPs), cc.Partition, cc.Region)) {
					fmt.Fprintln(out, "aborted")
					return nil
				}
			}

			return k8s.TalosUpgrade(ctx, *kube, k8s.UpgradeOptions{
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

// confirm prompts the operator for a yes/no answer on stdin, defaulting to no.
func confirm(prompt string) bool {
	fmt.Fprintf(os.Stderr, "%s [y/N]: ", prompt)
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil {
		return false
	}
	answer := strings.ToLower(strings.TrimSpace(line))
	return answer == "y" || answer == "yes"
}
