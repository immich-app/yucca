package cli

import (
	"fmt"
	"strconv"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
)

// newFeaturesCmd builds the `features` subtree: the feature-flag registry and
// fleet-wide operations (per-user set/clear lives under `users features`).
func newFeaturesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "features",
		Short: "Feature-flag registry and batch enrollment",
	}
	cmd.AddCommand(newFeaturesListCmd())
	cmd.AddCommand(newFeaturesUsersCmd())
	cmd.AddCommand(newFeaturesEnableBatchCmd())
	return cmd
}

func printFeatureUsers(cmd *cobra.Command, items []adminapi.FeatureUser) {
	w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
	fmt.Fprintln(w, "EMAIL\tVALUE\tSET BY\tREASON\tUPDATED")
	for _, u := range items {
		reason := ""
		if u.Reason != nil {
			reason = *u.Reason
		}
		fmt.Fprintf(w, "%s\t%t\t%s\t%s\t%s\n", u.Email, u.Value, u.SetBy, reason, u.UpdatedAt)
	}
	w.Flush()
}

func newFeaturesListCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "list",
		Short: "List the feature-flag registry with override counts",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			featureFlags, err := client.ListFeatures(cmd.Context())
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "FLAG\tDEFAULT\tSTAGE\tOVERRIDES\tSINCE\tDESCRIPTION")
			for _, f := range featureFlags {
				fmt.Fprintf(w, "%s\t%t\t%s\t%d\t%s\t%s\n", f.Key, f.Default, f.Stage, f.Overrides, f.Since, f.Description)
			}
			w.Flush()
			return nil
		},
	}
	flags.register(c)
	return c
}

func newFeaturesUsersCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "users <flag>",
		Short: "List users holding an override for a flag",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			items, err := client.ListFeatureUsers(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			printFeatureUsers(cmd, items)
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d override(s) for %s\n", len(items), args[0])
			return nil
		},
	}
	flags.register(c)
	return c
}

func newFeaturesEnableBatchCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "enable-batch <flag> <count>",
		Short: "Enable a flag for the oldest <count> users without an override",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			count, err := strconv.Atoi(args[1])
			if err != nil || count < 1 {
				return fmt.Errorf("count must be a positive integer")
			}
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			enabled, err := client.EnableFeatureBatch(cmd.Context(), args[0], count)
			if err != nil {
				return err
			}
			printFeatureUsers(cmd, enabled)
			fmt.Fprintf(cmd.ErrOrStderr(), "\nenabled %s for %d user(s)\n", args[0], len(enabled))
			return nil
		},
	}
	flags.register(c)
	return c
}
