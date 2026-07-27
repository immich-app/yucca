package cli

import (
	"fmt"
	"path/filepath"

	"github.com/spf13/cobra"

	"fubar/internal/config"
	"fubar/internal/keychain"
	"fubar/internal/restic"
	"fubar/internal/ui"
)

func newInitCmd() *cobra.Command {
	var paths, excludes []string
	var cronExpr, repoName string
	var keepDaily, keepWeekly, keepMonthly int
	var worm bool
	c := &cobra.Command{
		Use:   "init <plan-name>",
		Short: "Create a backup plan (repository + password + schedule)",
		Long: "Create a plan: a yucca repository is provisioned, an encryption password is\n" +
			"generated and stored in your keychain, the restic repository is initialized,\n" +
			"and the plan (paths, schedule, retention) is written to config.toml.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			out := cmd.ErrOrStderr()
			name := args[0]

			if len(paths) == 0 {
				return fmt.Errorf("at least one --path is required")
			}
			for i, p := range paths {
				abs, err := filepath.Abs(p)
				if err != nil {
					return err
				}
				paths[i] = abs
			}

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			if _, err := cfg.Plan(name); err == nil {
				return fmt.Errorf("plan %q already exists", name)
			}

			apiClient, err := client()
			if err != nil {
				return err
			}
			bin, err := restic.Ensure(ctx)
			if err != nil {
				return err
			}

			if repoName == "" {
				repoName = "fubar: " + name
			}
			fmt.Fprintf(out, "%s creating repository %q…\n", ui.Accent.Render("•"), repoName)
			repo, err := apiClient.CreateRepository(ctx, repoName, worm)
			if err != nil {
				return err
			}

			password := keychain.Generate()
			location, err := keychain.Store(repo.ID, password)
			if err != nil {
				return err
			}

			fmt.Fprintf(out, "%s initializing restic repository…\n", ui.Accent.Render("•"))
			url, err := apiClient.ResticURL(ctx, repo.ID)
			if err != nil {
				return err
			}
			r := &restic.Restic{Bin: bin, Repo: url, Password: password}
			if _, err := r.EnsureInit(ctx); err != nil {
				return err
			}

			cfg.Plans = append(cfg.Plans, config.Plan{
				Name:        name,
				Repository:  repo.ID,
				Paths:       paths,
				Excludes:    excludes,
				Cron:        cronExpr,
				KeepDaily:   keepDaily,
				KeepWeekly:  keepWeekly,
				KeepMonthly: keepMonthly,
			})
			if err := config.Save(cfg); err != nil {
				return err
			}

			fmt.Fprintln(out)
			fmt.Fprintf(out, "%s plan %q ready (repository %s)\n", ui.Good.Render("✓"), name, repo.ID)
			fmt.Fprintln(out)
			fmt.Fprintln(out, ui.Warn.Render("  RECOVERY PASSWORD — store this somewhere safe. Without it (or your"))
			fmt.Fprintln(out, ui.Warn.Render("  keychain) the repository CANNOT be decrypted:"))
			fmt.Fprintln(out)
			fmt.Fprintln(out, "  "+ui.CodeBox.Render(password))
			fmt.Fprintln(out)
			fmt.Fprintf(out, "  stored in: %s\n", location)
			if cronExpr != "" {
				fmt.Fprintf(out, "  schedule:  %s (run `fubar service install` to activate)\n", cronExpr)
			}
			fmt.Fprintf(out, "\n  first backup: %s\n", ui.Accent.Render("fubar backup "+name))
			return nil
		},
	}
	c.Flags().StringArrayVar(&paths, "path", nil, "path to back up (repeatable)")
	c.Flags().StringArrayVar(&excludes, "exclude", nil, "exclude pattern (repeatable)")
	c.Flags().StringVar(&cronExpr, "cron", "", `schedule, e.g. "0 2 * * *" (daily 02:00)`)
	c.Flags().StringVar(&repoName, "repo-name", "", "repository display name (default: fubar: <plan>)")
	c.Flags().IntVar(&keepDaily, "keep-daily", 7, "retention: daily snapshots to keep (0 = off)")
	c.Flags().IntVar(&keepWeekly, "keep-weekly", 4, "retention: weekly snapshots to keep (0 = off)")
	c.Flags().IntVar(&keepMonthly, "keep-monthly", 6, "retention: monthly snapshots to keep (0 = off)")
	c.Flags().BoolVar(&worm, "worm", false, "write-once repository (snapshots cannot be deleted)")
	return c
}
