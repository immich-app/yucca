package worker

import (
	"context"
	"errors"
	"testing"
	"time"

	"columbo/internal/agent"
)

type fakeInvestigator struct {
	adhoc func(ctx context.Context, userID, prompt string) (string, []string, error)
}

func (f *fakeInvestigator) Triage(context.Context, agent.Investigation) (bool, string, error) {
	return false, "", nil
}

func (f *fakeInvestigator) Investigate(context.Context, agent.Investigation) (string, []string, error) {
	return "", nil, nil
}

func (f *fakeInvestigator) InvestigateAdhoc(ctx context.Context, userID, prompt string) (string, []string, error) {
	return f.adhoc(ctx, userID, prompt)
}

func waitForStatus(t *testing.T, pool *Pool, id, want string) AdhocJob {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, ok := pool.GetAdhoc(id)
		if !ok {
			t.Fatalf("job %s disappeared", id)
		}
		if job.Status == want {
			return job
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("job %s never reached status %q", id, want)
	return AdhocJob{}
}

func TestAdhocJobLifecycle(t *testing.T) {
	investigator := &fakeInvestigator{
		adhoc: func(_ context.Context, userID, prompt string) (string, []string, error) {
			if userID != "user-1" || prompt != "why slow" {
				return "", nil, errors.New("wrong arguments")
			}
			return "note text", []string{"metrics: up"}, nil
		},
	}
	pool := NewPool(investigator, nil, time.Second, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pool.Run(ctx, 1)

	id, err := pool.StartAdhoc("user-1", "why slow")
	if err != nil {
		t.Fatal(err)
	}
	job := waitForStatus(t, pool, id, "done")
	if job.Note != "note text" || len(job.Queries) != 1 {
		t.Fatalf("unexpected job %+v", job)
	}
	if _, ok := pool.GetAdhoc("missing"); ok {
		t.Fatal("expected a miss for an unknown id")
	}
}

func TestAdhocFailureIsRecorded(t *testing.T) {
	investigator := &fakeInvestigator{
		adhoc: func(context.Context, string, string) (string, []string, error) {
			return "", []string{"logs: error"}, errors.New("model exploded")
		},
	}
	pool := NewPool(investigator, nil, time.Second, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pool.Run(ctx, 1)

	id, err := pool.StartAdhoc("user-1", "p")
	if err != nil {
		t.Fatal(err)
	}
	job := waitForStatus(t, pool, id, "failed")
	if job.Error != "model exploded" || len(job.Queries) != 1 {
		t.Fatalf("unexpected job %+v", job)
	}
}

func TestAdhocConcurrencyIsBounded(t *testing.T) {
	release := make(chan struct{})
	investigator := &fakeInvestigator{
		adhoc: func(ctx context.Context, _, _ string) (string, []string, error) {
			select {
			case <-release:
			case <-ctx.Done():
			}
			return "done", nil, nil
		},
	}
	pool := NewPool(investigator, nil, time.Minute, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pool.Run(ctx, 1)

	if _, err := pool.StartAdhoc("user-1", "first"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.StartAdhoc("user-1", "second"); !errors.Is(err, ErrBusy) {
		t.Fatalf("err = %v, want ErrBusy", err)
	}
	close(release)
}
