package cli

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"yuctl/cmdutil"
	"yuctl/ctxstore"
)

// parseTarget splits the human form `partition@region`.
func parseTarget(s string) (partition, region string, err error) {
	p, r, ok := strings.Cut(s, "@")
	if !ok || p == "" || r == "" {
		return "", "", fmt.Errorf("target must be in the form <partition>@<region> (e.g. staging@austin)")
	}
	return p, r, nil
}

func newSelectCmd(f *cmdutil.Factory) *cobra.Command {
	return &cobra.Command{
		Use:   "select <partition>@<region>",
		Short: "Select the active partition/region context",
		Long: "Validate <partition>@<region> against discovery, persist it to\n" +
			"${XDG_CONFIG_HOME:-~/.config}/yuctl/context.json, and clear any selected\n" +
			"Ceph cluster.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			partition, region, err := parseTarget(args[0])
			if err != nil {
				return err
			}

			topo, err := f.Topology(cmd.Context())
			if err != nil {
				return err
			}
			if !topo.HasRegion(partition, region) {
				return fmt.Errorf("unknown region %s@%s; known regions: %s",
					partition, region, strings.Join(topo.Regions(), ", "))
			}

			newCtx := &ctxstore.Context{Partition: partition, Region: region}
			if err := ctxstore.Save(newCtx); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "selected %s@%s\n", partition, region)
			return nil
		},
	}
}
