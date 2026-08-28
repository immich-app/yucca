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
	"sync"
	"time"

	"columbo/internal/agent"
	"columbo/internal/bot"

	"github.com/rs/zerolog/log"
)

const (
	queueSize      = 32
	adhocRetention = time.Hour
)

var ErrBusy = errors.New("all investigation workers are busy — retry shortly")

type Investigator interface {
	Triage(ctx context.Context, inv agent.Investigation) (bool, string, error)
	Investigate(ctx context.Context, inv agent.Investigation) (string, []string, error)
	InvestigateAdhoc(ctx context.Context, userID, prompt string) (string, []string, error)
}

type AdhocJob struct {
	ID      string   `json:"id"`
	Status  string   `json:"status"`
	Note    string   `json:"note,omitempty"`
	Queries []string `json:"queries,omitempty"`
	Error   string   `json:"error,omitempty"`

	finishedAt time.Time
}

type Pool struct {
	runner  Investigator
	bot     *bot.Client
	timeout time.Duration
	queue   chan agent.Investigation
	wg      sync.WaitGroup

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

		ctx, cancel := context.WithTimeout(p.baseCtx, p.timeout)
		defer cancel()
		note, queries, err := p.runner.InvestigateAdhoc(ctx, userID, prompt)

		p.adhocMu.Lock()
		defer p.adhocMu.Unlock()
		job.Queries = queries
		job.finishedAt = time.Now()
		if err != nil {
			log.Error().Err(err).Str("jobId", id).Str("userId", userID).Msg("ad-hoc investigation failed")
			job.Status = "failed"
			job.Error = err.Error()
			return
		}
		job.Status = "done"
		job.Note = note
		log.Info().Str("jobId", id).Str("userId", userID).Int("queries", len(queries)).Msg("ad-hoc investigation done")
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
