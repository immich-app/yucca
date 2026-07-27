package cli

import (
	"fmt"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/spf13/cobra"

	"fubar/internal/config"
	"fubar/internal/ui"
)

func nextRun(cronExpr string) string {
	if cronExpr == "" {
		return "manual"
	}
	schedule, err := cron.ParseStandard(cronExpr)
	if err != nil {
		return "invalid cron"
	}
	return schedule.Next(time.Now()).Format("2006-01-02 15:04")
}

func newStatusCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "status",
		Short: "Plans, last runs, and repository sizes at a glance",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			out := cmd.OutOrStdout()

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			state, err := config.LoadState()
			if err != nil {
				return err
			}

			// Repository sizes come from the API (server-side metering); status
			// stays useful offline, so API errors degrade to blanks.
			sizes := map[string]int64{}
			if apiClient, err := client(); err == nil {
				if repos, err := apiClient.ListRepositories(ctx); err == nil {
					for _, repo := range repos {
						if repo.Meter != nil {
							sizes[repo.ID] = int64(repo.Meter.SizeBytes)
						}
					}
				}
			}

			if flagJSON {
				type planStatus struct {
					Plan    config.Plan       `json:"plan"`
					LastRun *config.RunRecord `json:"lastRun,omitempty"`
					Size    int64             `json:"sizeBytes"`
				}
				statuses := make([]planStatus, 0, len(cfg.Plans))
				for _, plan := range cfg.Plans {
					status := planStatus{Plan: plan, Size: sizes[plan.Repository]}
					if record, ok := state.LastRuns[plan.Name]; ok {
						status.LastRun = &record
					}
					statuses = append(statuses, status)
				}
				return printJSON(statuses)
			}

			if len(cfg.Plans) == 0 {
				fmt.Fprintln(out, ui.Subtle.Render("no plans yet — create one with `fubar init <name> --path <dir>`"))
				return nil
			}

			fmt.Fprintln(out, ui.Title.Render("fubar status"))
			fmt.Fprintln(out)
			for _, plan := range cfg.Plans {
				fmt.Fprintf(out, "  %s  %s\n", ui.Accent.Render("▸"), ui.Title.Render(plan.Name))

				last := "never"
				badge := ui.Subtle.Render("○")
				if record, ok := state.LastRuns[plan.Name]; ok {
					age := time.Since(record.End).Round(time.Minute)
					if record.Success {
						badge = ui.Good.Render("●")
						last = fmt.Sprintf("%s ago (%s added)", age, ui.Bytes(record.AddedBytes))
					} else {
						badge = ui.Bad.Render("●")
						last = fmt.Sprintf("%s ago FAILED: %s", age, record.Error)
					}
					if time.Since(record.End) > 48*time.Hour && plan.Cron != "" {
						last += ui.Warn.Render("  (stale!)")
					}
				}
				fmt.Fprintf(out, "     %s last run: %s\n", badge, last)
				fmt.Fprintf(out, "     %s next run: %s\n", ui.Subtle.Render("·"), nextRun(plan.Cron))
				if size, ok := sizes[plan.Repository]; ok && size > 0 {
					fmt.Fprintf(out, "     %s size:     %s\n", ui.Subtle.Render("·"), ui.Bytes(size))
				}
				fmt.Fprintln(out)
			}
			return nil
		},
	}
	return c
}
