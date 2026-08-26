package users

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/adminapi"
	"yuctl/cli/users/allowlist"
	"yuctl/cli/users/connections"
	ufeatures "yuctl/cli/users/features"
	"yuctl/cmdutil"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "users",
		Short: "User administration via yucca-admin-api",
	}
	cmd.AddCommand(
		newListCmd(f),
		newGetCmd(f),
		newLinkDiscordCmd(f),
		newUnlinkDiscordCmd(f),
		allowlist.New(f),
		newViewDashboardCmd(f),
		ufeatures.New(f),
		connections.New(f),
	)
	return cmd
}

func newListCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var limitFlag string
	c := &cobra.Command{
		Use:   "list",
		Short: "List users in the partition's primary region",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			limit, err := adminapi.ParseLimit(limitFlag)
			if err != nil {
				return err
			}
			client, partition, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}

			users, err := client.ListUsers(ctx, limit)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tSUB\tNAME\tEMAIL\tDISABLED")
			for _, u := range users {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%t\n", u.ID, u.Sub, u.Name, u.Email, u.Disabled)
			}
			w.Flush()
			fmt.Fprintf(f.IO.Err, "\n%d user(s) in partition %s\n", len(users), partition)
			return nil
		},
	}
	c.Flags().StringVar(&limitFlag, "limit", "", "page size for the admin-api (default: server default)")
	admin.Register(c)
	return c
}

const defaultGrafanaURL = "https://grafana.futostatus.com"

func newViewDashboardCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
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
				client, partition, err := admin.Client(cmd.Context(), f)
				if err != nil {
					return err
				}
				id, err = client.ResolveUserID(cmd.Context(), email)
				if err != nil {
					return fmt.Errorf("%w in partition %s", err, partition)
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

			fmt.Fprintln(f.IO.Out, dashboardURL)
			if noOpen {
				return nil
			}
			if err := cmdutil.OpenBrowser(dashboardURL); err != nil {
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
	admin.Register(c)
	return c
}

func registerUserSelector(c *cobra.Command, userID, email *string) {
	c.Flags().StringVar(userID, "id", "", "user id (uuid)")
	c.Flags().StringVar(email, "email", "", "user email; resolved to an id via the admin-api")
	c.MarkFlagsOneRequired("id", "email")
	c.MarkFlagsMutuallyExclusive("id", "email")
}

func resolveUser(cmd *cobra.Command, f *cmdutil.Factory, admin *cmdutil.AdminFlags, userID, email string) (*adminapi.Client, string, error) {
	client, partition, err := admin.Client(cmd.Context(), f)
	if err != nil {
		return nil, "", err
	}
	if email == "" {
		return client, userID, nil
	}
	id, err := client.ResolveUserID(cmd.Context(), email)
	if err != nil {
		return nil, "", fmt.Errorf("%w in partition %s", err, partition)
	}
	return client, id, nil
}

func newGetCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var userID, email string
	c := &cobra.Command{
		Use:   "get",
		Short: "Everything the admin-api knows about a user",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, id, err := resolveUser(cmd, f, admin, userID, email)
			if err != nil {
				return err
			}
			detail, err := client.GetUser(ctx, id)
			if err != nil {
				return err
			}
			connections, err := client.GetUserConnections(ctx, id)
			if err != nil {
				return err
			}
			features, err := client.GetUserFeatures(ctx, id)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintf(w, "ID\t%s\n", detail.User.ID)
			fmt.Fprintf(w, "SUB\t%s\n", detail.User.Sub)
			fmt.Fprintf(w, "NAME\t%s\n", detail.User.Name)
			fmt.Fprintf(w, "EMAIL\t%s\n", detail.User.Email)
			fmt.Fprintf(w, "DISABLED\t%t\n", detail.User.Disabled)
			if detail.DiscordLink != nil {
				fmt.Fprintf(w, "DISCORD\t%s (@%s), linked %s\n",
					detail.DiscordLink.DiscordUserID, detail.DiscordLink.DiscordUsername, detail.DiscordLink.CreatedAt)
			} else {
				fmt.Fprintf(w, "DISCORD\tnot linked\n")
			}
			w.Flush()

			fmt.Fprintln(f.IO.Out)
			w = tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "CONNECTION\tTYPE\tNAME\tLAST SEEN")
			for _, connection := range connections {
				lastSeen := ""
				if connection.LastSeenAt != nil {
					lastSeen = *connection.LastSeenAt
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", connection.ID, connection.Type, connection.Name, lastSeen)
			}
			w.Flush()

			if len(features.Overrides) > 0 {
				fmt.Fprintln(f.IO.Out)
				w = tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
				fmt.Fprintln(w, "FEATURE OVERRIDE\tVALUE\tSET BY\tREASON")
				for _, override := range features.Overrides {
					reason := ""
					if override.Reason != nil {
						reason = *override.Reason
					}
					fmt.Fprintf(w, "%s\t%t\t%s\t%s\n", override.Flag, override.Value, override.SetBy, reason)
				}
				w.Flush()
			}
			return nil
		},
	}
	registerUserSelector(c, &userID, &email)
	admin.Register(c)
	return c
}

func newLinkDiscordCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var userID, email, discordID, discordUsername string
	c := &cobra.Command{
		Use:   "link-discord",
		Short: "Bind a discord account to a user (replaces any existing link on either side)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, id, err := resolveUser(cmd, f, admin, userID, email)
			if err != nil {
				return err
			}
			link, err := client.LinkDiscord(cmd.Context(), id, discordID, discordUsername)
			if err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "linked user %s to discord %s (@%s)\n", id, link.DiscordUserID, link.DiscordUsername)
			return nil
		},
	}
	registerUserSelector(c, &userID, &email)
	c.Flags().StringVar(&discordID, "discord-id", "", "discord user id (snowflake)")
	c.Flags().StringVar(&discordUsername, "discord-username", "", "discord username (informational)")
	_ = c.MarkFlagRequired("discord-id")
	admin.Register(c)
	return c
}

func newUnlinkDiscordCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var userID, email string
	c := &cobra.Command{
		Use:   "unlink-discord",
		Short: "Remove a user's discord link",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, id, err := resolveUser(cmd, f, admin, userID, email)
			if err != nil {
				return err
			}
			if err := client.UnlinkDiscord(cmd.Context(), id); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "unlinked discord from user %s\n", id)
			return nil
		},
	}
	registerUserSelector(c, &userID, &email)
	admin.Register(c)
	return c
}
