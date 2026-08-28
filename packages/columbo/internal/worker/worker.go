// Package worker drains the investigation queue with bounded concurrency and
// a hard per-investigation deadline, so a wedged model call can never pile up
// goroutines or hold a ticket's investigation open indefinitely.
package worker

import (
	"context"
	"sync"
	"time"

	"columbo/internal/agent"
	"columbo/internal/bot"

	"github.com/rs/zerolog/log"
)

const queueSize = 32

type Pool struct {
	runner  *agent.Runner
	bot     *bot.Client
	timeout time.Duration
	queue   chan agent.Investigation
	wg      sync.WaitGroup
}

func NewPool(runner *agent.Runner, botClient *bot.Client, timeout time.Duration) *Pool {
	return &Pool{
		runner:  runner,
		bot:     botClient,
		timeout: timeout,
		queue:   make(chan agent.Investigation, queueSize),
	}
}

func (p *Pool) Enqueue(inv agent.Investigation) bool {
	select {
	case p.queue <- inv:
		return true
	default:
		return false
	}
}

func (p *Pool) Run(ctx context.Context, workers int) {
	for range workers {
		p.wg.Add(1)
		go func() {
			defer p.wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case inv := <-p.queue:
					p.process(ctx, inv)
				}
			}
		}()
	}
}

func (p *Pool) Wait() {
	p.wg.Wait()
}

func (p *Pool) process(ctx context.Context, inv agent.Investigation) {
	logger := log.With().Str("staffThreadId", inv.StaffThreadID).Str("userId", inv.UserID).Logger()
	ctx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	investigate, reason, err := p.runner.Triage(ctx, inv)
	if err != nil {
		logger.Error().Err(err).Msg("triage failed")
		return
	}
	if !investigate {
		logger.Info().Str("reason", reason).Msg("triage: no investigation needed")
		return
	}
	logger.Info().Str("reason", reason).Msg("triage: investigating")

	note, queries, err := p.runner.Investigate(ctx, inv)
	if err != nil {
		logger.Error().Err(err).Strs("queries", queries).Msg("investigation failed")
		return
	}

	// The note must land even when the investigation used the whole time
	// budget, so posting gets its own deadline.
	postCtx, postCancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer postCancel()
	if err := p.bot.PostStaffNote(postCtx, inv.StaffThreadID, formatNote(note, queries)); err != nil {
		logger.Error().Err(err).Msg("failed to post the staff note")
		return
	}
	logger.Info().Int("queries", len(queries)).Msg("investigation posted")
}

func formatNote(note string, queries []string) string {
	out := note + "\n\n-# AI-generated from this user's metrics and logs — verify before acting on it."
	if len(queries) > 0 {
		out += "\n-# Queries: "
		for i, q := range queries {
			if i > 0 {
				out += " · "
			}
			if len(q) > 120 {
				q = q[:120] + "…"
			}
			out += q
		}
	}
	return out
}
