package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"fubar/internal/config"
	"fubar/internal/keychain"
	"fubar/internal/restic"
	"fubar/internal/ui"
)

func newDoctorCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "doctor",
		Short: "Check login, API connectivity, restic, and plan health",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			out := cmd.OutOrStdout()
			problems := 0

			check := func(name string, err error, detail string) {
				if err != nil {
					problems++
					fmt.Fprintf(out, "  %s %s: %v\n", ui.Bad.Render("✗"), name, err)
					return
				}
				fmt.Fprintf(out, "  %s %s%s\n", ui.Good.Render("✓"), name, detail)
			}

			fmt.Fprintln(out, ui.Title.Render("fubar doctor"))
			fmt.Fprintln(out)

			bin, err := restic.Ensure(ctx)
			detail := ""
			if err == nil {
				if v, verr := (&restic.Restic{Bin: bin}).Version(ctx); verr == nil {
					detail = " (" + v + ")"
				}
			}
			check("restic", err, detail)

			token, err := config.LoadToken()
			check("login", err, "")
			if err != nil {
				fmt.Fprintln(out, ui.Subtle.Render("\n  run `fubar login --api <url>` first"))
				return fmt.Errorf("%d problem(s)", problems)
			}

			apiClient, err := client()
			if err != nil {
				check("api client", err, "")
				return fmt.Errorf("%d problem(s)", problems)
			}
			auth, err := apiClient.GetAuth(ctx)
			detail = ""
			if err == nil {
				detail = fmt.Sprintf(" (%s @ %s)", auth.Email, token.API)
			}
			check("api session", err, detail)

			if err == nil && !auth.Features["consumer-fubar"] {
				problems++
				fmt.Fprintf(out, "  %s the fubar feature (consumer-fubar) is not enabled for this account\n", ui.Warn.Render("!"))
			}

			cfg, err := config.Load()
			check("config", err, "")
			if err == nil {
				for _, plan := range cfg.Plans {
					if _, err := keychain.Load(plan.Repository); err != nil {
						problems++
						fmt.Fprintf(out, "  %s plan %q: no password in keychain\n", ui.Bad.Render("✗"), plan.Name)
					} else {
						fmt.Fprintf(out, "  %s plan %q: password present\n", ui.Good.Render("✓"), plan.Name)
					}
				}
			}

			fmt.Fprintln(out)
			if problems > 0 {
				return fmt.Errorf("%d problem(s) found", problems)
			}
			fmt.Fprintln(out, ui.Good.Render("all good"))
			return nil
		},
	}
	return c
}
