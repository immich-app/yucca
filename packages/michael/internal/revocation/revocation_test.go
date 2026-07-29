package revocation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

const testSecret = "test-secret"

// fakeSource is an httptest introspection endpoint. `active` holds jtis that
// answer active:true; `down` makes it return 503; `calls` counts requests.
type fakeSource struct {
	server *httptest.Server
	active map[string]bool
	down   atomic.Bool
	calls  atomic.Int64
}

func newFakeSource(t *testing.T) *fakeSource {
	t.Helper()
	f := &fakeSource{active: map[string]bool{}}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.calls.Add(1)
		if r.Header.Get("X-Introspection-Secret") != testSecret {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if f.down.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		jti := strings.TrimPrefix(r.URL.Path, "/")
		w.Header().Set("Content-Type", "application/json")
		if f.active[jti] {
			_, _ = w.Write([]byte(`{"active":true}`))
		} else {
			_, _ = w.Write([]byte(`{"active":false}`))
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeSource) introspector() *HTTPIntrospector {
	return NewHTTPIntrospector(f.server.URL, testSecret, time.Second)
}

func newValidator(t *testing.T, f *fakeSource, l2 *RedisVerdictCache, fresh, grace time.Duration) *LayeredValidator {
	t.Helper()
	v := NewLayeredValidator(f.introspector(), l2, fresh, grace)
	t.Cleanup(func() { _ = v.Close() })
	return v
}

func TestInvalidWhenSourceSaysInactive(t *testing.T) {
	f := newFakeSource(t)
	v := newValidator(t, f, nil, time.Second, time.Minute)

	if d, err := v.Check(context.Background(), "unknown-jti"); d != DecisionInvalid || err != nil {
		t.Fatalf("expected DecisionInvalid, got %v/%v", d, err)
	}
}

func TestValidWhenSourceSaysActive(t *testing.T) {
	f := newFakeSource(t)
	f.active["good"] = true
	v := newValidator(t, f, nil, time.Second, time.Minute)

	if d, err := v.Check(context.Background(), "good"); d != DecisionValid || err != nil {
		t.Fatalf("expected DecisionValid, got %v/%v", d, err)
	}
}

func TestWrongSecretIsAnErrorNotARevocation(t *testing.T) {
	f := newFakeSource(t)
	f.active["good"] = true
	v := NewLayeredValidator(NewHTTPIntrospector(f.server.URL, "wrong", time.Second), nil, time.Nanosecond, time.Minute)
	t.Cleanup(func() { _ = v.Close() })

	// Never confirmed valid → unavailable (denied), NOT invalid: an auth
	// misconfiguration must not read as "everything is revoked" silently.
	if d, err := v.Check(context.Background(), "good"); d != DecisionUnavailable || err == nil {
		t.Fatalf("expected DecisionUnavailable with error, got %v/%v", d, err)
	}
}

// A confirmed verdict is served from L1 within the fresh TTL — no source calls.
func TestFreshCacheServesWithoutLookup(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	v := newValidator(t, f, nil, time.Minute, time.Minute)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}
	before := f.calls.Load()

	// Source now says revoked, but the fresh cache still answers valid.
	f.active["jti"] = false
	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected cached DecisionValid within fresh TTL, got %v", d)
	}
	if f.calls.Load() != before {
		t.Fatalf("expected no extra source calls, got %d", f.calls.Load()-before)
	}
}

func TestRevokeTakesEffectAfterFreshTTL(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	v := newValidator(t, f, nil, time.Nanosecond, time.Nanosecond)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	f.active["jti"] = false
	time.Sleep(time.Millisecond)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid after fresh TTL expiry, got %v", d)
	}
}

// Source outage: a previously-valid jti is honored (grace) until the grace TTL,
// then denied as unavailable. Generous 2s grace so CI stalls can't flake it.
func TestGraceHonorsPreviouslyValidThenDenies(t *testing.T) {
	const graceTTL = 2 * time.Second
	f := newFakeSource(t)
	f.active["jti"] = true
	v := newValidator(t, f, nil, time.Nanosecond, graceTTL)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	f.down.Store(true)
	time.Sleep(time.Millisecond) // past fresh, well within grace

	if d, err := v.Check(context.Background(), "jti"); d != DecisionGrace || err == nil {
		t.Fatalf("expected DecisionGrace with error during outage, got %v/%v", d, err)
	}

	time.Sleep(graceTTL + 100*time.Millisecond)
	if d, err := v.Check(context.Background(), "jti"); d != DecisionUnavailable || err == nil {
		t.Fatalf("expected DecisionUnavailable after grace, got %v/%v", d, err)
	}
}

// An outage for a jti never confirmed valid is denied immediately — no grace.
func TestUnavailableWhenDownAndNeverValidated(t *testing.T) {
	f := newFakeSource(t)
	f.down.Store(true)
	v := newValidator(t, f, nil, time.Second, time.Minute)

	if d, err := v.Check(context.Background(), "unknown"); d != DecisionUnavailable || err == nil {
		t.Fatalf("expected DecisionUnavailable, got %v/%v", d, err)
	}
}

// A jti confirmed invalid does not get grace during a later outage.
func TestInvalidJtiNotGraced(t *testing.T) {
	f := newFakeSource(t)
	v := newValidator(t, f, nil, time.Nanosecond, time.Minute)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid, got %v", d)
	}

	f.down.Store(true)
	time.Sleep(time.Millisecond)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionUnavailable {
		t.Fatalf("expected DecisionUnavailable (no grace for invalid jti), got %v", d)
	}
}

// --- L2 (shared verdict cache) behavior ---

func newL2(t *testing.T, mr *miniredis.Miniredis, ttl time.Duration) *RedisVerdictCache {
	t.Helper()
	return NewRedisVerdictCache(mr.Addr(), 100*time.Millisecond, ttl)
}

// A verdict written back by one replica is served to another from L2, without
// touching the source.
func TestL2SharesVerdictsAcrossReplicas(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	mr := miniredis.RunT(t)

	replicaA := newValidator(t, f, newL2(t, mr, time.Minute), time.Minute, time.Minute)
	if d, _ := replicaA.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}
	callsAfterA := f.calls.Load()

	replicaB := newValidator(t, f, newL2(t, mr, time.Minute), time.Minute, time.Minute)
	if d, _ := replicaB.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid from L2, got %v", d)
	}
	if f.calls.Load() != callsAfterA {
		t.Fatalf("expected replica B to be served from L2, got %d extra source calls", f.calls.Load()-callsAfterA)
	}
}

// The revoke-DEL: deleting the L2 key forces the next (post-fresh) check back
// to the source, which now answers inactive.
func TestL2DeleteOnRevokePropagates(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	mr := miniredis.RunT(t)
	v := newValidator(t, f, newL2(t, mr, time.Minute), time.Nanosecond, time.Nanosecond)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}
	if !mr.Exists(verdictKey("jti")) {
		t.Fatal("expected verdict written back to L2")
	}

	// Revoke: the API flips the DB and DELs the L2 key.
	f.active["jti"] = false
	mr.Del(verdictKey("jti"))
	time.Sleep(time.Millisecond) // past L1 fresh

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid after revoke-DEL, got %v", d)
	}
}

// Redis being down is invisible: L2 errors fall through to the source.
func TestL2OutageFallsThroughToSource(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	mr := miniredis.RunT(t)
	l2 := newL2(t, mr, time.Minute)
	mr.Close()

	v := newValidator(t, f, l2, time.Second, time.Minute)
	if d, err := v.Check(context.Background(), "jti"); d != DecisionValid || err != nil {
		t.Fatalf("expected DecisionValid via source despite L2 outage, got %v/%v", d, err)
	}
}

// The grace horizon is anchored to when the L2 entry was WRITTEN (last
// authoritative confirmation), not to the cache read — REVOCATION_GRACE_MS is
// an end-to-end bound, never grace + L2 TTL.
func TestGraceAnchoredToAuthoritativeTime(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	mr := miniredis.RunT(t)
	const l2TTL = 200 * time.Millisecond
	const graceTTL = 300 * time.Millisecond
	v := newValidator(t, f, newL2(t, mr, l2TTL), time.Nanosecond, graceTTL)

	// Authoritative confirmation at T0 writes the L2 entry.
	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	// The entry ages 150ms (miniredis clock); the source goes down. An L2 hit
	// must anchor grace at T0: only ~150ms of grace remain, not a fresh 300ms.
	mr.FastForward(150 * time.Millisecond)
	f.down.Store(true)
	time.Sleep(time.Millisecond) // past L1 fresh
	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid from L2, got %v", d)
	}

	// Expire the L2 entry and move past the anchored horizon (T0+300ms): a
	// read-anchored horizon would still grant grace here; the anchored one denies.
	mr.FastForward(60 * time.Millisecond)
	time.Sleep(250 * time.Millisecond)
	if d, _ := v.Check(context.Background(), "jti"); d != DecisionUnavailable {
		t.Fatalf("expected DecisionUnavailable past the anchored grace horizon, got %v", d)
	}
}

// A failed introspection dial gates further dials for the backoff window —
// concurrent restic requests during an outage resolve from grace semantics
// instead of stacking up behind the introspection timeout.
func TestSourceFailureBackoffPreventsStorm(t *testing.T) {
	f := newFakeSource(t)
	f.down.Store(true)
	v := newValidator(t, f, nil, time.Nanosecond, time.Minute)
	v.sourceBackoff = 300 * time.Millisecond

	if d, _ := v.Check(context.Background(), "a"); d != DecisionUnavailable {
		t.Fatalf("expected DecisionUnavailable, got %v", d)
	}
	calls := f.calls.Load()

	// Within the backoff window: no new dials.
	if d, err := v.Check(context.Background(), "b"); d != DecisionUnavailable || err == nil {
		t.Fatalf("expected DecisionUnavailable with error, got %v/%v", d, err)
	}
	if f.calls.Load() != calls {
		t.Fatalf("expected no source calls within backoff, got %d extra", f.calls.Load()-calls)
	}

	// After the window: dials resume, and recovery clears the gate.
	f.down.Store(false)
	f.active["c"] = true
	time.Sleep(350 * time.Millisecond)
	if d, err := v.Check(context.Background(), "c"); d != DecisionValid || err != nil {
		t.Fatalf("expected DecisionValid after backoff, got %v/%v", d, err)
	}
	if f.calls.Load() != calls+1 {
		t.Fatalf("expected exactly one post-backoff source call, got %d", f.calls.Load()-calls)
	}
}

// A stale L2 verdict (missed DEL) expires with its TTL, after which the source
// is consulted again — the self-heal path.
func TestL2StaleVerdictExpires(t *testing.T) {
	f := newFakeSource(t)
	f.active["jti"] = true
	mr := miniredis.RunT(t)
	v := newValidator(t, f, newL2(t, mr, 50*time.Millisecond), time.Nanosecond, time.Nanosecond)

	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected DecisionValid, got %v", d)
	}

	// Revoked in the DB but the DEL was missed: the stale L2 entry still
	// answers valid until its TTL lapses.
	f.active["jti"] = false
	time.Sleep(time.Millisecond)
	if d, _ := v.Check(context.Background(), "jti"); d != DecisionValid {
		t.Fatalf("expected stale DecisionValid from L2, got %v", d)
	}

	mr.FastForward(time.Second) // expire the L2 entry
	time.Sleep(time.Millisecond)
	if d, _ := v.Check(context.Background(), "jti"); d != DecisionInvalid {
		t.Fatalf("expected DecisionInvalid after stale L2 entry expired, got %v", d)
	}
}
