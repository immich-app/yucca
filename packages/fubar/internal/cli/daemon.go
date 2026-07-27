package cli

import (
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"fubar/internal/config"
	"fubar/internal/restic"
)

func newDaemonCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "daemon",
		Short: "Run scheduled backups (the process `fubar service install` manages)",
		Long: "Run every plan on its cron schedule until interrupted. Each run gets a small\n" +
			"random jitter (0-60s) so a fleet of machines doesn't stampede the backend at\n" +
			"the same minute. Missed runs (machine asleep) are not caught up in v1 — the\n" +
			"next scheduled run covers it.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			apiClient, err := client()
			if err != nil {
				return err
			}
			bin, err := restic.Ensure(ctx)
			if err != nil {
				return err
			}
			// Progress output is pointless in a daemon; logs carry the outcome.
			deps := runDeps{Client: apiClient, Bin: bin, Out: nil, JSON: true}

			scheduler := cron.New()
			scheduled := 0
			// One-at-a-time across plans: overlapping restic runs on a laptop
			// help nobody, and per-plan locks already guard single-flight.
			var mu sync.Mutex
			for i := range cfg.Plans {
				plan := &cfg.Plans[i]
				if plan.Cron == "" {
					log.Info().Str("plan", plan.Name).Msg("no cron configured; skipping")
					continue
				}
				if _, err := cron.ParseStandard(plan.Cron); err != nil {
					return fmt.Errorf("plan %q has an invalid cron %q: %w", plan.Name, plan.Cron, err)
				}
				_, err := scheduler.AddFunc(plan.Cron, func() {
					jitter := time.Duration(rand.Intn(60)) * time.Second
					log.Info().Str("plan", plan.Name).Dur("jitter", jitter).Msg("scheduled run starting")
					select {
					case <-time.After(jitter):
					case <-ctx.Done():
						return
					}

					mu.Lock()
					defer mu.Unlock()
					start := time.Now()
					if _, err := runPlan(ctx, deps, plan); err != nil {
						log.Error().Err(err).Str("plan", plan.Name).Msg("scheduled backup failed")
						return
					}
					log.Info().Str("plan", plan.Name).Dur("took", time.Since(start)).Msg("scheduled backup done")
				})
				if err != nil {
					return err
				}
				scheduled++
			}
			if scheduled == 0 {
				return fmt.Errorf("no plans with a cron schedule — add one with `fubar init --cron`")
			}

			log.Info().Int("plans", scheduled).Msg("fubar daemon running")
			scheduler.Start()
			<-ctx.Done()
			<-scheduler.Stop().Done()
			return nil
		},
	}
	return c
}
