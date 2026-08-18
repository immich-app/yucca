package tools

import (
	"github.com/spf13/cobra"

	"yuctl/cli/tools/bench"
	"yuctl/cli/tools/fleetbench"
	"yuctl/cli/tools/warp"
	"yuctl/cmdutil"
)

func New(f *cmdutil.Factory) *cobra.Command {
	tools := &cobra.Command{
		Use:   "tools",
		Short: "Operational tooling for the selected context",
	}
	tools.AddCommand(bench.New(f), fleetbench.New(f), warp.New(f))
	return tools
}
