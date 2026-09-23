package proxy

import (
	"bytes"
	"context"
	"io"
	"sync/atomic"
	"testing"
	"time"
)

func throttled(t *testing.T, bytesPerSec int, quietHours string) *atomic.Pointer[throttle] {
	t.Helper()

	limit, err := newThrottle(bytesPerSec, quietHours)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	current := &atomic.Pointer[throttle]{}
	current.Store(limit)

	return current
}

func TestPaced_SpendsTheBurstWithoutWaiting(t *testing.T) {
	current := throttled(t, 200_000, "")
	payload := bytes.Repeat([]byte("x"), current.Load().limiter.Burst())

	started := time.Now()
	read, err := io.ReadAll(newPaced(t.Context(), io.NopCloser(bytes.NewReader(payload)), current))
	elapsed := time.Since(started)

	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(read) != len(payload) {
		t.Fatalf("expected %d bytes, got %d", len(payload), len(read))
	}
	if elapsed > 50*time.Millisecond {
		t.Errorf("expected the burst to be spent without waiting, took %s", elapsed)
	}
}

func TestPaced_SlowsReadsBeyondTheBurstToTheLimit(t *testing.T) {
	const bytesPerSec = 200_000

	current := throttled(t, bytesPerSec, "")
	burst := current.Load().limiter.Burst()
	payload := bytes.Repeat([]byte("x"), 3*burst)
	expected := time.Duration(len(payload)-burst) * time.Second / bytesPerSec

	started := time.Now()
	read, err := io.ReadAll(newPaced(t.Context(), io.NopCloser(bytes.NewReader(payload)), current))
	elapsed := time.Since(started)

	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(read) != len(payload) {
		t.Fatalf("expected %d bytes, got %d", len(payload), len(read))
	}
	if elapsed < expected*8/10 {
		t.Errorf("expected about %s of pacing, took %s", expected, elapsed)
	}
}

func TestPaced_StopsSlowingDownWhenTheLimitIsLifted(t *testing.T) {
	const bytesPerSec = 20_000

	current := throttled(t, bytesPerSec, "")
	burst := current.Load().limiter.Burst()
	payload := bytes.Repeat([]byte("x"), 4*burst)
	body := newPaced(t.Context(), io.NopCloser(bytes.NewReader(payload)), current)

	if _, err := io.ReadAll(io.LimitReader(body, int64(burst))); err != nil {
		t.Fatalf("read the burst: %v", err)
	}

	current.Store(nil)

	started := time.Now()
	read, err := io.ReadAll(body)
	elapsed := time.Since(started)

	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(read) != len(payload)-burst {
		t.Fatalf("expected %d bytes, got %d", len(payload)-burst, len(read))
	}
	if elapsed > 100*time.Millisecond {
		t.Errorf("expected the lifted limit to stop the pacing, took %s", elapsed)
	}
}

func TestPaced_StopsWaitingWhenTheRequestIsCancelled(t *testing.T) {
	current := throttled(t, 1, "")
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	payload := bytes.Repeat([]byte("x"), 2*current.Load().limiter.Burst())
	_, err := io.ReadAll(newPaced(ctx, io.NopCloser(bytes.NewReader(payload)), current))

	if err == nil {
		t.Error("expected a cancelled request to stop the read")
	}
}
