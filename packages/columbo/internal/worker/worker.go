// Package worker drains the investigation queue with bounded concurrency and
// a hard per-investigation deadline, so a wedged model call can never pile up
// goroutines or hold a ticket's investigation open indefinitely. Ad-hoc
// (staff-requested) investigations run under the same deadline through a
// separate semaphore, with their results held in memory for polling.
package worker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"columbo/internal/agent"
	"columbo/internal/bot"
	"columbo/internal/metrics"

	"github.com/rs/zerolog/log"
)

const (
	queueSize      = 32
	adhocRetention = time.Hour
)

var ErrBusy = errors.New("all investigation workers are busy — retry shortly")

type Investigator interface {
	Triage(ctx context.Context, inv agent.Investigation) (bool, string, error)
	Investigate(ctx context.Context, inv agent.Investigation) (agent.Outcome, error)
	InvestigateAdhoc(ctx context.Context, userID, prompt string) (agent.Outcome, error)
}

type AdhocJob struct {
	ID               string   `json:"id"`
	Status           string   `json:"status"`
	Note             string   `json:"note,omitempty"`
	Queries          []string `json:"queries,omitempty"`
	Error            string   `json:"error,omitempty"`
	ToolCalls        int      `json:"toolCalls,omitempty"`
	PromptTokens     int      `json:"promptTokens,omitempty"`
	CompletionTokens int      `json:"completionTokens,omitempty"`

	finishedAt time.Time
}

type Pool struct {
	runner  Investigator
	bot     *bot.Client
	timeout time.Duration
	queue   chan agent.Investigation
	wg      sync.WaitGroup

	// GrafanaURL links the staff note's investigation id to the
	// yucca-columbo audit dashboard; empty leaves the id as plain text.
	GrafanaURL string
	// Metrics is nil-safe; nil means metrics are disabled.
	Metrics *metrics.Recorder

	baseCtx  context.Context
	adhocSem chan struct{}
	adhocMu  sync.Mutex
	adhoc    map[string]*AdhocJob
}

func NewPool(runner Investigator, botClient *bot.Client, timeout time.Duration, workers int) *Pool {
	return &Pool{
		runner:   runner,
		bot:      botClient,
		timeout:  timeout,
		queue:    make(chan agent.Investigation, queueSize),
		adhocSem: make(chan struct{}, workers),
		adhoc:    map[string]*AdhocJob{},
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
	p.baseCtx = ctx
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

func (p *Pool) StartAdhoc(userID, prompt string) (string, error) {
	select {
	case p.adhocSem <- struct{}{}:
	default:
		return "", ErrBusy
	}

	id := newJobID()
	job := &AdhocJob{ID: id, Status: "running"}
	p.adhocMu.Lock()
	p.pruneLocked()
	p.adhoc[id] = job
	p.adhocMu.Unlock()

	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		defer func() { <-p.adhocSem }()

		logger := log.With().Str("investigationId", id).Str("userId", userID).Str("trigger", "adhoc").Logger()
		ctx, cancel := context.WithTimeout(logger.WithContext(p.baseCtx), p.timeout)
		defer cancel()
		logger.Info().Str("audit", "adhoc_start").Str("prompt", prompt).Msg("columbo audit: ad-hoc investigation start")
		outcome, err := p.runner.InvestigateAdhoc(ctx, userID, prompt)

		p.adhocMu.Lock()
		defer p.adhocMu.Unlock()
		job.Queries = outcome.Queries
		job.ToolCalls = outcome.ToolCalls
		job.PromptTokens = outcome.PromptTokens
		job.CompletionTokens = outcome.CompletionTokens
		job.finishedAt = time.Now()
		if err != nil {
			logger.Error().Err(err).Str("audit", "adhoc_failed").Msg("ad-hoc investigation failed")
			job.Status = "failed"
			job.Error = err.Error()
			p.Metrics.Record(context.WithoutCancel(ctx), "adhoc", "failed", outcome)
			return
		}
		job.Status = "done"
		job.Note = outcome.Note
		p.Metrics.Record(context.WithoutCancel(ctx), "adhoc", "done", outcome)
		logger.Info().
			Str("audit", "note").
			Str("note", outcome.Note).
			Int("toolCalls", outcome.ToolCalls).
			Int("promptTokens", outcome.PromptTokens).
			Int("completionTokens", outcome.CompletionTokens).
			Msg("ad-hoc investigation done")
	}()

	return id, nil
}

func (p *Pool) GetAdhoc(id string) (AdhocJob, bool) {
	p.adhocMu.Lock()
	defer p.adhocMu.Unlock()
	job, ok := p.adhoc[id]
	if !ok {
		return AdhocJob{}, false
	}
	return *job, true
}

func (p *Pool) pruneLocked() {
	for id, job := range p.adhoc {
		if !job.finishedAt.IsZero() && time.Since(job.finishedAt) > adhocRetention {
			delete(p.adhoc, id)
		}
	}
}

func newJobID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (p *Pool) process(ctx context.Context, inv agent.Investigation) {
	id := newJobID()
	logger := log.With().
		Str("investigationId", id).
		Str("staffThreadId", inv.StaffThreadID).
		Str("userId", inv.UserID).
		Str("trigger", "ticket").
		Logger()
	ctx, cancel := context.WithTimeout(logger.WithContext(ctx), p.timeout)
	defer cancel()
	logger.Info().Str("audit", "ticket_start").Str("description", inv.Description).Msg("columbo audit: ticket investigation start")

	investigate, reason, err := p.runner.Triage(ctx, inv)
	if err != nil {
		logger.Error().Err(err).Msg("triage failed")
		p.Metrics.Record(context.WithoutCancel(ctx), "ticket", "triage_failed", agent.Outcome{})
		return
	}
	if !investigate {
		logger.Info().Str("reason", reason).Msg("triage: no investigation needed")
		p.Metrics.Record(context.WithoutCancel(ctx), "ticket", "skipped", agent.Outcome{})
		postCtx, postCancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer postCancel()
		if err := p.bot.PostStaffNote(postCtx, inv.StaffThreadID, p.skipNote(reason, id)); err != nil {
			logger.Error().Err(err).Msg("failed to post the skip note")
		}
		return
	}
	logger.Info().Str("reason", reason).Msg("triage: investigating")

	outcome, err := p.runner.Investigate(ctx, inv)
	if err != nil {
		logger.Error().Err(err).Strs("queries", outcome.Queries).Msg("investigation failed")
		p.Metrics.Record(context.WithoutCancel(ctx), "ticket", "failed", outcome)
		return
	}
	p.Metrics.Record(context.WithoutCancel(ctx), "ticket", "done", outcome)

	// The note must land even when the investigation used the whole time
	// budget, so posting gets its own deadline.
	postCtx, postCancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer postCancel()
	if err := p.bot.PostStaffNote(postCtx, inv.StaffThreadID, p.formatNote(outcome, id)); err != nil {
		logger.Error().Err(err).Msg("failed to post the staff note")
		return
	}
	logger.Info().
		Str("audit", "note").
		Str("note", outcome.Note).
		Int("toolCalls", outcome.ToolCalls).
		Int("promptTokens", outcome.PromptTokens).
		Int("completionTokens", outcome.CompletionTokens).
		Msg("investigation posted")
}

func (p *Pool) skipNote(reason, id string) string {
	if reason == "" {
		reason = "the ticket does not look telemetry-related"
	}
	return "No investigation needed — " + reason + "\n\n-# AI triage decision, no telemetry was read. " + p.investigationLink(id)
}

func (p *Pool) investigationLink(id string) string {
	investigation := "Investigation " + id
	if p.GrafanaURL != "" {
		investigation = fmt.Sprintf("[%s](%s/d/yucca-columbo?var-investigation=%s)", investigation, strings.TrimRight(p.GrafanaURL, "/"), id)
	}
	return investigation
}

func (p *Pool) formatNote(outcome agent.Outcome, id string) string {
	out := outcome.Note + "\n\n-# AI-generated from this user's metrics and logs — verify before acting on it. " + p.investigationLink(id)
	out += fmt.Sprintf(
		"\n-# Cost: %d tool calls · %s in / %s out tokens · %ds",
		outcome.ToolCalls, formatTokens(outcome.PromptTokens), formatTokens(outcome.CompletionTokens),
		int(outcome.Duration.Seconds()),
	)
	if len(outcome.Queries) > 0 {
		out += "\n-# Queries: "
		for i, q := range outcome.Queries {
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

func formatTokens(n int) string {
	if n >= 1000 {
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	}
	return fmt.Sprintf("%d", n)
}
