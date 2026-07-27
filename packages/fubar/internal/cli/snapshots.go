package cli

import (
	"fmt"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"fubar/internal/config"
	"fubar/internal/restic"
)

func newSnapshotsCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "snapshots <plan>",
		Short: "List a plan's snapshots",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			plan, err := cfg.Plan(args[0])
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

			r, err := resticFor(ctx, runDeps{Client: apiClient, Bin: bin}, plan)
			if err != nil {
				return err
			}
			snapshots, err := r.Snapshots(ctx)
			if err != nil {
				return err
			}

			if flagJSON {
				return printJSON(snapshots)
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tTIME\tPATHS\tTAGS")
			for _, s := range snapshots {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", s.ShortID, s.Time, strings.Join(s.Paths, ","), strings.Join(s.Tags, ","))
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d snapshot(s)\n", len(snapshots))
			return nil
		},
	}
	return c
}

func newRestoreCmd() *cobra.Command {
	var target string
	c := &cobra.Command{
		Use:   "restore <plan> <snapshot-id>",
		Short: "Restore a snapshot into --target",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			out := cmd.ErrOrStderr()

			if target == "" {
				return fmt.Errorf("--target is required (an empty directory to restore into)")
			}

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			plan, err := cfg.Plan(args[0])
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

			r, err := resticFor(ctx, runDeps{Client: apiClient, Bin: bin}, plan)
			if err != nil {
				return err
			}
			if err := r.Restore(ctx, args[1], target, nil); err != nil {
				return err
			}
			fmt.Fprintf(out, "restored %s into %s\n", args[1], target)
			return nil
		},
	}
	c.Flags().StringVar(&target, "target", "", "directory to restore into")
	return c
}

func newForgetCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "forget <plan>",
		Short: "Apply the plan's retention policy now (forget --prune)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			plan, err := cfg.Plan(args[0])
			if err != nil {
				return err
			}
			if !plan.HasRetention() {
				return fmt.Errorf("plan %q has no keep-* retention configured", plan.Name)
			}
			apiClient, err := client()
			if err != nil {
				return err
			}
			bin, err := restic.Ensure(ctx)
			if err != nil {
				return err
			}

			r, err := resticFor(ctx, runDeps{Client: apiClient, Bin: bin}, plan)
			if err != nil {
				return err
			}
			if err := r.Forget(ctx, plan.ForgetArgs()); err != nil {
				return err
			}
			fmt.Fprintln(cmd.ErrOrStderr(), "retention applied")
			return nil
		},
	}
	return c
}
