// Package features implements `yuctl users features`: per-user feature-flag
// overrides.
package features

import (
	"fmt"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/adminapi"
	"yuctl/cmdutil"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "features",
		Short: "Per-user feature-flag overrides",
	}
	cmd.AddCommand(newListCmd(f), newSetCmd(f), newClearCmd(f))
	return cmd
}

func newListCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "list <email>",
		Short: "Show a user's resolved feature flags and overrides",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}
			userID, err := client.ResolveUserID(ctx, args[0])
			if err != nil {
				return err
			}
			features, err := client.GetUserFeatures(ctx, userID)
			if err != nil {
				return err
			}

			overridden := map[string]adminapi.FeatureOverride{}
			for _, o := range features.Overrides {
				overridden[o.Flag] = o
			}

			w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "FLAG\tVALUE\tSOURCE\tSET BY\tREASON")
			for flag, value := range features.Features {
				if o, ok := overridden[flag]; ok {
					reason := ""
					if o.Reason != nil {
						reason = *o.Reason
					}
					fmt.Fprintf(w, "%s\t%t\toverride\t%s\t%s\n", flag, value, o.SetBy, reason)
				} else {
					fmt.Fprintf(w, "%s\t%t\tdefault\t\t\n", flag, value)
				}
			}
			w.Flush()
			return nil
		},
	}
	admin.Register(c)
	return c
}

func newSetCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var reason string
	c := &cobra.Command{
		Use:   "set <email> <flag> on|off",
		Short: "Set a per-user feature-flag override",
		Args:  cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) error {
			var value bool
			switch args[2] {
			case "on", "true":
				value = true
			case "off", "false":
				value = false
			default:
				return fmt.Errorf("value must be on|off, got %q", args[2])
			}

			ctx := cmd.Context()
			client, _, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}
			userID, err := client.ResolveUserID(ctx, args[0])
			if err != nil {
				return err
			}
			if _, err := client.SetUserFeature(ctx, userID, args[1], value, reason); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Err, "%s set to %t for %s\n", args[1], value, args[0])
			return nil
		},
	}
	c.Flags().StringVar(&reason, "reason", "", "audit note stored on the override")
	admin.Register(c)
	return c
}

func newClearCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "clear <email> <flag>",
		Short: "Clear an override (revert to the registry default)",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}
			userID, err := client.ResolveUserID(ctx, args[0])
			if err != nil {
				return err
			}
			if err := client.ClearUserFeature(ctx, userID, args[1]); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Err, "%s override cleared for %s\n", args[1], args[0])
			return nil
		},
	}
	admin.Register(c)
	return c
}
