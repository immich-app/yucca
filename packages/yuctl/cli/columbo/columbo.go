// Package columbo triggers ad-hoc telemetry investigations of one user's
// account via the partition's yucca-admin-api.
package columbo

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"yuctl/cmdutil"
)

const (
	pollInterval = 5 * time.Second
	pollBudget   = 15 * time.Minute
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "columbo",
		Short: "Ad-hoc telemetry investigations via yucca-admin-api",
	}
	cmd.AddCommand(newInvestigateCmd(f))
	return cmd
}

func newInvestigateCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var user, prompt string
	c := &cobra.Command{
		Use:   "investigate",
		Short: "Investigate one user's metrics and logs with a staff prompt",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, partition, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}

			userID := user
			if strings.Contains(user, "@") {
				userID, err = client.ResolveUserID(ctx, user)
				if err != nil {
					return err
				}
			}

			job, err := client.StartColumboInvestigation(ctx, userID, prompt)
			if err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Err, "investigation %s started for user %s in partition %s — polling…\n", job.ID, userID, partition)

			deadline := time.Now().Add(pollBudget)
			ticker := time.NewTicker(pollInterval)
			defer ticker.Stop()
			for job.Status == "running" {
				if time.Now().After(deadline) {
					return fmt.Errorf("investigation %s still running after %s — retry later with the admin API directly", job.ID, pollBudget)
				}
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-ticker.C:
				}
				job, err = client.GetColumboInvestigation(ctx, job.ID)
				if err != nil {
					return err
				}
			}

			if job.Status == "failed" {
				reason := "unknown error"
				if job.Error != nil {
					reason = *job.Error
				}
				return fmt.Errorf("investigation failed: %s", reason)
			}

			if job.Note != nil {
				fmt.Fprintln(f.IO.Out, strings.TrimSpace(*job.Note))
			}
			if len(job.Queries) > 0 {
				fmt.Fprintf(f.IO.Err, "\nqueries run:\n")
				for _, q := range job.Queries {
					fmt.Fprintf(f.IO.Err, "  %s\n", q)
				}
			}
			return nil
		},
	}
	admin.Register(c)
	c.Flags().StringVar(&user, "user", "", "user email or id (required)")
	c.Flags().StringVar(&prompt, "prompt", "", "what to investigate (required)")
	_ = c.MarkFlagRequired("user")
	_ = c.MarkFlagRequired("prompt")
	return c
}
