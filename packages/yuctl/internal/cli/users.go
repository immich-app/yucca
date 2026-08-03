package cli

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
)

// newUsersCmd builds the `users` subtree.
func newUsersCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "users",
		Short: "User administration via yucca-admin-api",
	}
	cmd.AddCommand(newUsersListCmd())
	cmd.AddCommand(newUsersAllowlistCmd())
	cmd.AddCommand(newUsersViewDashboardCmd())
	cmd.AddCommand(newUsersFeaturesCmd())
	return cmd
}

// newUsersFeaturesCmd builds `users features`: per-user feature-flag overrides.
func newUsersFeaturesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "features",
		Short: "Per-user feature-flag overrides",
	}
	cmd.AddCommand(newUsersFeaturesListCmd())
	cmd.AddCommand(newUsersFeaturesSetCmd())
	cmd.AddCommand(newUsersFeaturesClearCmd())
	return cmd
}

func newUsersFeaturesListCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "list <email>",
		Short: "Show a user's resolved feature flags and overrides",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			userID, err := resolveUserID(ctx, client, args[0])
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

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
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
	flags.register(c)
	return c
}

func newUsersFeaturesSetCmd() *cobra.Command {
	flags := &adminFlags{}
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
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			userID, err := resolveUserID(ctx, client, args[0])
			if err != nil {
				return err
			}
			if _, err := client.SetUserFeature(ctx, userID, args[1], value, reason); err != nil {
				return err
			}
			fmt.Fprintf(cmd.ErrOrStderr(), "%s set to %t for %s\n", args[1], value, args[0])
			return nil
		},
	}
	c.Flags().StringVar(&reason, "reason", "", "audit note stored on the override")
	flags.register(c)
	return c
}

func newUsersFeaturesClearCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "clear <email> <flag>",
		Short: "Clear an override (revert to the registry default)",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			userID, err := resolveUserID(ctx, client, args[0])
			if err != nil {
				return err
			}
			if err := client.ClearUserFeature(ctx, userID, args[1]); err != nil {
				return err
			}
			fmt.Fprintf(cmd.ErrOrStderr(), "%s override cleared for %s\n", args[1], args[0])
			return nil
		},
	}
	flags.register(c)
	return c
}

// newUsersConnectionsCmd builds `users connections`.

const defaultGrafanaURL = "https://grafana.futostatus.com"

func newUsersViewDashboardCmd() *cobra.Command {
	flags := &adminFlags{}
	var userID, email, grafanaURL string
	var noOpen bool
	c := &cobra.Command{
		Use:   "view-dashboard",
		Short: "Open the per-user Grafana dashboard for a user",
		Long: "Build the Grafana per-user drill-down URL (dashboard uid yucca-per-user) for\n" +
			"a user and open it in the browser. --id builds the URL without contacting the\n" +
			"admin-api; --email resolves the user via the partition's admin-api first.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			id := userID
			if email != "" {
				client, partition, err := flags.allowlistClient(cmd)
				if err != nil {
					return err
				}
				users, err := client.ListUsers(cmd.Context(), 0)
				if err != nil {
					return err
				}
				id = ""
				for _, u := range users {
					if strings.EqualFold(u.Email, email) {
						id = u.ID
						break
					}
				}
				if id == "" {
					return fmt.Errorf("no user with email %q in partition %s", email, partition)
				}
			}

			base := grafanaURL
			if base == "" {
				base = os.Getenv("YUCTL_GRAFANA_URL")
			}
			if base == "" {
				base = defaultGrafanaURL
			}
			dashboardURL := strings.TrimRight(base, "/") + "/d/yucca-per-user?var-user=" + url.QueryEscape(id)

			fmt.Fprintln(cmd.OutOrStdout(), dashboardURL)
			if noOpen {
				return nil
			}
			if err := openBrowser(dashboardURL); err != nil {
				return fmt.Errorf("open browser: %w", err)
			}
			return nil
		},
	}
	c.Flags().StringVar(&userID, "id", "", "user id (uuid)")
	c.Flags().StringVar(&email, "email", "", "user email; resolved to an id via the admin-api")
	c.Flags().StringVar(&grafanaURL, "grafana-url", "", "Grafana base URL (default: $YUCTL_GRAFANA_URL or "+defaultGrafanaURL+")")
	c.Flags().BoolVar(&noOpen, "no-open", false, "print the dashboard URL instead of opening the browser")
	c.MarkFlagsOneRequired("id", "email")
	c.MarkFlagsMutuallyExclusive("id", "email")
	flags.register(c)
	return c
}

func newUsersListCmd() *cobra.Command {
	flags := &adminFlags{}
	var limitFlag string
	c := &cobra.Command{
		Use:   "list",
		Short: "List users in the partition's primary region",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			cc, err := requireContext()
			if err != nil {
				return err
			}

			limit, err := adminapi.ParseLimit(limitFlag)
			if err != nil {
				return err
			}

			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}

			client, _, err := flags.adminLogin(ctx, cmd, cc, topo)
			if err != nil {
				return err
			}

			users, err := client.ListUsers(ctx, limit)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tSUB\tNAME\tEMAIL\tDISABLED")
			for _, u := range users {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%t\n", u.ID, u.Sub, u.Name, u.Email, u.Disabled)
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d user(s) in partition %s\n", len(users), cc.Partition)
			return nil
		},
	}
	c.Flags().StringVar(&limitFlag, "limit", "", "page size for the admin-api (default: server default)")
	flags.register(c)
	return c
}

// newUsersAllowlistCmd builds the `users allowlist` subtree (beta email
// allowlist + invites).
func newUsersAllowlistCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "allowlist",
		Short: "Manage the beta email allowlist and invites",
	}
	cmd.AddCommand(newAllowlistListCmd())
	cmd.AddCommand(newAllowlistAddCmd())
	cmd.AddCommand(newAllowlistRemoveCmd())
	cmd.AddCommand(newAllowlistInviteCmd())
	cmd.AddCommand(newAllowlistInviteBatchCmd())
	return cmd
}

func (f *adminFlags) allowlistClient(cmd *cobra.Command) (*adminapi.Client, string, error) {
	ctx := cmd.Context()
	cc, err := requireContext()
	if err != nil {
		return nil, "", err
	}
	topo, err := resolveTopology(ctx)
	if err != nil {
		return nil, "", err
	}
	client, _, err := f.adminLogin(ctx, cmd, cc, topo)
	if err != nil {
		return nil, "", err
	}
	return client, cc.Partition, nil
}

func printAllowlistEntries(cmd *cobra.Command, entries []adminapi.AllowlistEntry) {
	w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
	fmt.Fprintln(w, "EMAIL\tCODE\tINVITED\tUSED\tUSED AT\tCREATED")
	for _, e := range entries {
		usedAt := ""
		if e.InviteUsedAt != nil {
			usedAt = *e.InviteUsedAt
		}
		fmt.Fprintf(w, "%s\t%s\t%t\t%t\t%s\t%s\n", e.Email, e.InviteCode, e.Invited, e.InviteUsed, usedAt, e.CreatedAt)
	}
	w.Flush()
}

func newAllowlistListCmd() *cobra.Command {
	flags := &adminFlags{}
	var limitFlag string
	c := &cobra.Command{
		Use:   "list",
		Short: "List allowlist entries",
		RunE: func(cmd *cobra.Command, args []string) error {
			limit, err := adminapi.ParseLimit(limitFlag)
			if err != nil {
				return err
			}
			client, partition, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			entries, err := client.ListAllowlist(cmd.Context(), limit)
			if err != nil {
				return err
			}
			printAllowlistEntries(cmd, entries)
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d entries in partition %s\n", len(entries), partition)
			return nil
		},
	}
	c.Flags().StringVar(&limitFlag, "limit", "", "page size for the admin-api (default: server default)")
	flags.register(c)
	return c
}

func newAllowlistAddCmd() *cobra.Command {
	flags := &adminFlags{}
	var staged bool
	c := &cobra.Command{
		Use:   "add <email>",
		Short: "Allow an email to sign up (--staged to waitlist it instead)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			entry, err := client.AddAllowlistEntry(cmd.Context(), args[0], staged)
			if err != nil {
				return err
			}
			printAllowlistEntries(cmd, []adminapi.AllowlistEntry{*entry})
			return nil
		},
	}
	c.Flags().BoolVar(&staged, "staged", false, "stage the email without allowing login yet")
	flags.register(c)
	return c
}

func newAllowlistRemoveCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "remove <email>",
		Short: "Remove an email from the allowlist",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			if err := client.RemoveAllowlistEntry(cmd.Context(), args[0]); err != nil {
				return err
			}
			fmt.Fprintf(cmd.ErrOrStderr(), "removed %s\n", args[0])
			return nil
		},
	}
	flags.register(c)
	return c
}

func newAllowlistInviteCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "invite <email>[,<email>...]",
		Short: "Invite emails: allow them to sign up, creating entries as needed",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var emails []string
			for _, arg := range args {
				for _, email := range strings.Split(arg, ",") {
					if email = strings.TrimSpace(email); email != "" {
						emails = append(emails, email)
					}
				}
			}
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			entries, err := client.InviteEmails(cmd.Context(), emails)
			if err != nil {
				return err
			}
			printAllowlistEntries(cmd, entries)
			return nil
		},
	}
	flags.register(c)
	return c
}

func newAllowlistInviteBatchCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "invite-batch <count>",
		Short: "Invite the oldest <count> staged (waitlisted) emails",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			count, err := strconv.Atoi(args[0])
			if err != nil || count < 1 {
				return fmt.Errorf("count must be a positive integer")
			}
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			entries, err := client.InviteBatch(cmd.Context(), count)
			if err != nil {
				return err
			}
			printAllowlistEntries(cmd, entries)
			fmt.Fprintf(cmd.ErrOrStderr(), "\ninvited %d entries\n", len(entries))
			return nil
		},
	}
	flags.register(c)
	return c
}

// resolveUserID turns an --user email into a user id via the admin-api.
func resolveUserID(ctx context.Context, client *adminapi.Client, email string) (string, error) {
	users, err := client.ListUsers(ctx, 0)
	if err != nil {
		return "", err
	}
	for _, u := range users {
		if strings.EqualFold(u.Email, email) {
			return u.ID, nil
		}
	}
	return "", fmt.Errorf("no user with email %q", email)
}
