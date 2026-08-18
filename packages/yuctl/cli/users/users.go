// Package users implements `yuctl users`: user administration via
// yucca-admin-api.
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
