package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"fubar/internal/config"
	"fubar/internal/restic"
	"fubar/internal/ui"
)

func newBackupCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "backup [plan]",
		Short: "Run a backup now (all plans, or one)",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			out := cmd.ErrOrStderr()

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			name := ""
			if len(args) == 1 {
				name = args[0]
			}
			plans, err := selectPlans(cfg, name)
			if err != nil {
				return err
			}

			apiClient, err := client()
			if err != nil {
				return err
			}
			bin, err := restic.Ensure(ctx)
			if err != nil {
				return err
			}
			deps := runDeps{Client: apiClient, Bin: bin, Out: out, JSON: flagJSON}

			var results []runResult
			var failed int
			for _, plan := range plans {
				fmt.Fprintf(out, "%s %s\n", ui.Accent.Render("▶"), ui.Title.Render(plan.Name))
				result, err := runPlan(ctx, deps, plan)
				if err != nil {
					failed++
					fmt.Fprintf(out, "%s %s: %v\n", ui.Bad.Render("✗"), plan.Name, err)
					continue
				}
				results = append(results, *result)
				fmt.Fprintf(out, "%s %s: snapshot %s, %s added in %.1fs\n",
					ui.Good.Render("✓"), plan.Name, result.SnapshotID[:8],
					ui.Bytes(result.AddedBytes), float64(result.DurationMS)/1000)
			}

			if flagJSON {
				if err := printJSON(results); err != nil {
					return err
				}
			}
			if failed > 0 {
				return fmt.Errorf("%d of %d plan(s) failed", failed, len(plans))
			}
			return nil
		},
	}
	return c
}
