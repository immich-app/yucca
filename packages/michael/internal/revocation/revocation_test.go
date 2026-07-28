package revocation

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func newTestValidator(t *testing.T, freshTTL, graceTTL time.Duration) (*miniredis.Miniredis, *RedisValidator) {
	t.Helper()
	mr := miniredis.RunT(t)
	r := NewRedisValidator(mr.Addr(), 100*time.Millisecond, freshTTL, graceTTL)
	t.Cleanup(func() { _ = r.Close() })
	return mr, r
}

func TestInvalidWhenMarkerAbsent(t *testing.T) {
	_, r := newTestValidator(t, time.Second, time.Minute)

	decision, err := r.Check(context.Background(), "some-jti")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if decision != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid for absent marker, got %v", decision)
	}
}

func TestValidWhenMarkerPresent(t *testing.T) {
	mr, r := newTestValidator(t, time.Second, time.Minute)
	if err := mr.Set(keyFor("good-jti"), "1"); err != nil {
		t.Fatal(err)
	}

	decision, err := r.Check(context.Background(), "good-jti")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if decision != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", decision)
	}
}

// A confirmed decision is served from cache within the fresh TTL, so a revoke
// (marker deletion) only takes effect once the fresh entry expires.
func TestFreshCacheServesUntilExpiry(t *testing.T) {
	mr, r := newTestValidator(t, time.Minute, time.Minute)
	if err := mr.Set(keyFor("jti"), "1"); err != nil {
		t.Fatal(err)
	}

	if d, _ := r.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	// Marker deleted (revoked), but the fresh cache still answers valid.
	mr.Del(keyFor("jti"))
	if d, _ := r.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected cached DecisionValid within fresh TTL, got %v", d)
	}
}

func TestRevokeTakesEffectAfterFreshTTL(t *testing.T) {
	mr, r := newTestValidator(t, time.Nanosecond, time.Nanosecond)
	if err := mr.Set(keyFor("jti"), "1"); err != nil {
		t.Fatal(err)
	}

	if d, _ := r.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	mr.Del(keyFor("jti"))
	time.Sleep(time.Millisecond)

	if d, _ := r.Check(context.Background(), "jti"); d != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid after fresh TTL expiry, got %v", d)
	}
}

// Redis outage: a previously-valid jti is honored (grace) until the grace TTL,
// then denied as unavailable.
func TestGraceHonorsPreviouslyValidThenDenies(t *testing.T) {
	mr, r := newTestValidator(t, time.Nanosecond, 50*time.Millisecond)
	if err := mr.Set(keyFor("jti"), "1"); err != nil {
		t.Fatal(err)
	}

	// Confirm valid once (populates the grace window).
	if d, _ := r.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	// Redis goes down.
	mr.Close()
	time.Sleep(time.Millisecond) // past fresh, well within grace

	if d, err := r.Check(context.Background(), "jti"); d != DecisionGrace || err == nil {
		t.Fatalf("expected DecisionGrace with error during outage, got %v/%v", d, err)
	}

	// Past the grace window: fail closed.
	time.Sleep(60 * time.Millisecond)
	if d, err := r.Check(context.Background(), "jti"); d != DecisionUnavailable || err == nil {
		t.Fatalf("expected DecisionUnavailable after grace, got %v/%v", d, err)
	}
}

// An outage for a jti never confirmed valid is denied immediately — no grace.
func TestUnavailableWhenDownAndNeverValidated(t *testing.T) {
	mr, r := newTestValidator(t, time.Second, time.Minute)
	mr.Close()

	d, err := r.Check(context.Background(), "unknown-jti")
	if err == nil {
		t.Fatal("expected error when redis is down")
	}
	if d != DecisionUnavailable {
		t.Fatalf("expected DecisionUnavailable for never-validated jti, got %v", d)
	}
}

// A jti confirmed invalid does not get grace during a later outage.
func TestInvalidJtiNotGraced(t *testing.T) {
	mr, r := newTestValidator(t, time.Nanosecond, time.Minute)

	// Confirmed invalid (no marker).
	if d, _ := r.Check(context.Background(), "jti"); d != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid, got %v", d)
	}

	mr.Close()
	time.Sleep(time.Millisecond)

	if d, _ := r.Check(context.Background(), "jti"); d != DecisionUnavailable {
		t.Fatalf("expected DecisionUnavailable (no grace for invalid jti), got %v", d)
	}
}
