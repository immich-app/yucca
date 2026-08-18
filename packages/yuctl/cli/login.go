package cli

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"yuctl/cmdutil"
)

func newLoginCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "login",
		Short: "Log in to the partition's yucca-admin-api via the browser",
		Long: "Authenticate against the selected partition's admin-api (primary region):\n" +
			"opens the admin-api CLI login in your browser, receives a one-time code on a\n" +
			"127.0.0.1 listener, exchanges it for a 24h session JWT, and caches it at\n" +
			"${XDG_CONFIG_HOME:-~/.config}/yuctl/admin-token-<partition>.json.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			cc, err := f.Context()
			if err != nil {
				return err
			}
			topo, err := f.Topology(ctx)
			if err != nil {
				return err
			}

			client, token, err := admin.Login(ctx, f, cc, topo)
			if err != nil {
				return err
			}

			// Round-trip the session so "login" only succeeds when the API
			// actually accepts the token.
			sub, err := client.GetAuth(ctx)
			if err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "logged in to %s as %s (expires %s)\n",
				cc.Partition, sub, token.Expiry.Local().Format(time.RFC3339))
			return nil
		},
	}
	admin.Register(c)
	return c
}
