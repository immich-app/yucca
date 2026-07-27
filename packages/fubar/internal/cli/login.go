package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"fubar/internal/api"
	"fubar/internal/config"
	"fubar/internal/ui"
)

func newLoginCmd() *cobra.Command {
	var apiURL, name string
	var noBrowser bool
	c := &cobra.Command{
		Use:   "login",
		Short: "Log in to FUTO Backups (device flow)",
		Long: "Authenticate this machine against yucca via the OIDC device flow. The\n" +
			"session registers as a `fubar` consumer named after this host, so your\n" +
			"backups show up attributed to this machine.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			out := cmd.ErrOrStderr()

			base := apiURL
			if base == "" {
				base = flagAPI
			}
			if base == "" {
				base = os.Getenv("FUBAR_API")
			}
			if base == "" {
				return fmt.Errorf("pass --api <url> (e.g. --api https://api.backups.futo.org)")
			}
			base = strings.TrimRight(base, "/")

			if name == "" {
				host, err := os.Hostname()
				if err != nil || host == "" {
					host = "fubar"
				}
				name = host
			}

			fmt.Fprintln(out, ui.Title.Render("fubar login"))
			accessToken, err := api.DeviceFlow(ctx, base, name, func(event api.DeviceEvent) {
				fmt.Fprintln(out)
				fmt.Fprintln(out, "  Enter this code in your browser:")
				fmt.Fprintln(out)
				fmt.Fprintln(out, "  "+ui.CodeBox.Render(event.UserCode))
				fmt.Fprintln(out)
				fmt.Fprintln(out, "  "+ui.Subtle.Render(event.VerificationURI))
				fmt.Fprintln(out)
				if !noBrowser {
					_ = openBrowser(event.VerificationURI)
				}
				fmt.Fprintln(out, ui.Subtle.Render("  waiting for the browser grant…"))
			})
			if err != nil {
				return err
			}

			if err := config.SaveToken(&config.Token{API: base, AccessToken: accessToken}); err != nil {
				return err
			}

			// Round-trip so login only succeeds when the API accepts the session.
			apiClient := api.NewClient(base, accessToken)
			auth, err := apiClient.GetAuth(ctx)
			if err != nil {
				return err
			}

			fmt.Fprintln(out)
			fmt.Fprintf(out, "%s logged in as %s (%s)\n", ui.Good.Render("✓"), auth.Name, auth.Email)
			fmt.Fprintf(out, "  consumer: fubar/%s\n", name)
			if !auth.Features["multi-consumer"] {
				fmt.Fprintln(out, ui.Warn.Render("  note: the multi-consumer feature is not enabled for this account yet"))
			}
			return nil
		},
	}
	c.Flags().StringVar(&apiURL, "api", "", "yucca API base URL")
	c.Flags().StringVar(&name, "name", "", "consumer name for this machine (default: hostname)")
	c.Flags().BoolVar(&noBrowser, "no-browser", false, "do not auto-open the browser")
	return c
}
