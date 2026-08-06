package cli

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	yctx "yuctl/internal/context"
)

func parseTarget(s string) (partition, region string, err error) {
	p, r, ok := strings.Cut(s, "@")
	if !ok || p == "" || r == "" {
		return "", "", fmt.Errorf("target must be in the form <partition>@<region> (e.g. staging@austin)")
	}
	return p, r, nil
}

func newSelectCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "select <partition>@<region>",
		Short: "Select the active partition/region context",
		Long: "Validate <partition>@<region> against discovery, persist it to\n" +
			"${XDG_CONFIG_HOME:-~/.config}/yuctl/context.json, and clear any selected\n" +
			"Ceph cluster.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			partition, region, err := parseTarget(args[0])
			if err != nil {
				return err
			}

			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}
			if !topo.HasRegion(partition, region) {
				return fmt.Errorf("unknown region %s@%s; known regions: %s",
					partition, region, strings.Join(topo.Regions(), ", "))
			}

			newCtx := &yctx.Context{Partition: partition, Region: region}
			if err := yctx.Save(newCtx); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "selected %s@%s\n", partition, region)
			return nil
		},
	}
}

func requireContext() (*yctx.Context, error) {
	c, err := yctx.Load()
	if err != nil {
		return nil, err
	}
	if !c.Selected() {
		return nil, fmt.Errorf("no context selected; run `yuctl select <partition>@<region>` first")
	}
	return c, nil
}
