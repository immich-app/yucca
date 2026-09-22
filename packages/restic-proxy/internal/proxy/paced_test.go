package proxy

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

func TestPaced_SpendsTheBurstWithoutWaiting(t *testing.T) {
	limiter := rate.NewLimiter(200_000, copyBufferSize)
	payload := bytes.Repeat([]byte("x"), limiter.Burst())

	started := time.Now()
	read, err := io.ReadAll(newPaced(t.Context(), io.NopCloser(bytes.NewReader(payload)), limiter))
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

	limiter := rate.NewLimiter(bytesPerSec, copyBufferSize)
	payload := bytes.Repeat([]byte("x"), 3*limiter.Burst())
	beyondTheBurst := len(payload) - limiter.Burst()
	expected := time.Duration(beyondTheBurst) * time.Second / bytesPerSec

	started := time.Now()
	read, err := io.ReadAll(newPaced(t.Context(), io.NopCloser(bytes.NewReader(payload)), limiter))
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

func TestPaced_StopsWaitingWhenTheRequestIsCancelled(t *testing.T) {
	limiter := rate.NewLimiter(1, 1)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	payload := bytes.Repeat([]byte("x"), 64)
	_, err := io.ReadAll(newPaced(ctx, io.NopCloser(bytes.NewReader(payload)), limiter))

	if err == nil {
		t.Error("expected a cancelled request to stop the read")
	}
}
