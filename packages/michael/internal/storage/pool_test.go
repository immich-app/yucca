package storage

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

// --- fakes ---

// fakeStore is an in-memory Storage used to drive the pool without real S3. It
// can be toggled to fail operations (transport-style) and to fail probes.
type fakeStore struct {
	endpoint  string
	opFail    atomic.Bool
	probeFail atomic.Bool
	getBody   string
	getErr    error // mid-stream read error to inject into the returned body
	calls     atomic.Int64

	listItems             []BlobInfo
	listFailAfterEmitting *int
}

func (f *fakeStore) transportErr() error {
	// No HTTPStatusCode => classified as a transport/backend failure.
	return errors.New("fake transport failure: " + f.endpoint)
}

func (f *fakeStore) CheckBucket(_ context.Context, _ string) (bool, error) {
	f.calls.Add(1)
	if f.opFail.Load() {
		return false, f.transportErr()
	}
	return true, nil
}

func (f *fakeStore) CreateBucket(_ context.Context, _ string) error {
	f.calls.Add(1)
	if f.opFail.Load() {
		return f.transportErr()
	}
	return nil
}

func (f *fakeStore) HeadObject(_ context.Context, _, _ string) (int64, error) {
	f.calls.Add(1)
	if f.opFail.Load() {
		return 0, f.transportErr()
	}
	return 0, nil
}

func (f *fakeStore) ListObjects(_ context.Context, _, _ string, fn func(BlobInfo) error) error {
	f.calls.Add(1)
	if f.opFail.Load() {
		return f.transportErr()
	}
	for i, item := range f.listItems {
		if f.listFailAfterEmitting != nil && i == *f.listFailAfterEmitting {
			return f.transportErr()
		}
		if err := fn(item); err != nil {
			return err
		}
	}
	if f.listFailAfterEmitting != nil && *f.listFailAfterEmitting >= len(f.listItems) {
		return f.transportErr()
	}
	return nil
}

func (f *fakeStore) DeleteObject(_ context.Context, _, _ string) error {
	f.calls.Add(1)
	if f.opFail.Load() {
		return f.transportErr()
	}
	return nil
}

func (f *fakeStore) PutObject(_ context.Context, _, _ string, body io.Reader, _ int64, _ bool, _ string) error {
	f.calls.Add(1)
	if f.opFail.Load() {
		return f.transportErr()
	}
	_, _ = io.Copy(io.Discard, body)
	return nil
}

func (f *fakeStore) GetObject(_ context.Context, _, _, _ string) (*S3Object, error) {
	f.calls.Add(1)
	if f.opFail.Load() {
		return nil, f.transportErr()
	}
	rc := io.NopCloser(strings.NewReader(f.getBody))
	if f.getErr != nil {
		rc = &errReadCloser{data: f.getBody, err: f.getErr}
	}
	return &S3Object{Body: rc, ContentLength: int64(len(f.getBody))}, nil
}

func (f *fakeStore) Probe(_ context.Context, _ string) error {
	if f.probeFail.Load() {
		return f.transportErr()
	}
	return nil
}

// errReadCloser returns data then an injected error (simulating a gateway dying
// mid-download).
type errReadCloser struct {
	data string
	off  int
	err  error
}

func (e *errReadCloser) Read(p []byte) (int, error) {
	if e.off < len(e.data) {
		n := copy(p, e.data[e.off:])
		e.off += n
		return n, nil
	}
	return 0, e.err
}
func (e *errReadCloser) Close() error { return nil }

// --- test harness ---

type testResolver struct {
	mu  sync.Mutex
	eps []string
	err error
}

func (r *testResolver) set(eps []string, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.eps, r.err = eps, err
}
func (r *testResolver) Resolve(_ context.Context) ([]string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.eps...), r.err
}
func (r *testResolver) Describe() string { return "test" }

// newTestPool builds a pool over a fake factory. The returned registry maps each
// endpoint to its *fakeStore so the test can toggle failures.
func newTestPool(t *testing.T, eps []string, threshold int) (*Pool, *testResolver, map[string]*fakeStore) {
	t.Helper()
	return newTestPoolCfg(t, eps, PoolConfig{EjectThreshold: threshold, ReconcileInterval: time.Hour})
}

func newTestPoolCfg(t *testing.T, eps []string, cfg PoolConfig) (*Pool, *testResolver, map[string]*fakeStore) {
	t.Helper()
	reg := map[string]*fakeStore{}
	var mu sync.Mutex
	factory := func(endpoint string) (Storage, error) {
		mu.Lock()
		defer mu.Unlock()
		f := &fakeStore{endpoint: endpoint, getBody: "blobdata"}
		reg[endpoint] = f
		return f, nil
	}
	res := &testResolver{eps: eps}
	p, err := NewPool(cfg, factory, res, zerolog.Nop())
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	return p, res, reg
}

func backendByEndpoint(p *Pool, ep string) *backend {
	for _, b := range p.snapshot() {
		if b.endpoint == ep {
			return b
		}
	}
	return nil
}

// --- tests ---

func TestPool_PickLeastOutstanding(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "b", "c"}, 3)
	bs := p.snapshot()
	// Give them distinct inflight loads; pick must choose the minimum.
	for _, b := range bs {
		switch b.endpoint {
		case "a":
			b.inflight.Store(5)
		case "b":
			b.inflight.Store(2)
		case "c":
			b.inflight.Store(9)
		}
	}
	got, err := p.pick()
	if err != nil {
		t.Fatalf("pick: %v", err)
	}
	if got.b.endpoint != "b" {
		t.Errorf("pick: expected least-loaded 'b', got %q", got.b.endpoint)
	}
}

func TestPool_PickTiebreakRotates(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "b", "c"}, 3)
	// All equal load => tiebreak should rotate across backends.
	seen := map[string]int{}
	for range 30 {
		pk, err := p.pick()
		if err != nil {
			t.Fatalf("pick: %v", err)
		}
		seen[pk.b.endpoint]++
	}
	if len(seen) < 2 {
		t.Errorf("tiebreak did not rotate; only hit %v", seen)
	}
}

// tripAllByTraffic drives real traffic failures until every backend is open,
// arming the shed window.
func tripAllByTraffic(t *testing.T, p *Pool, reg map[string]*fakeStore, threshold int) {
	t.Helper()
	for _, f := range reg {
		f.opFail.Store(true)
	}
	for range len(reg) * threshold * 2 {
		_, _ = p.HeadObject(context.Background(), "bucket", "k")
	}
	for _, b := range p.snapshot() {
		if b.state.Load() != stateOpen {
			t.Fatalf("backend %s not open after traffic failures", b.endpoint)
		}
	}
}

func TestPool_ShedsFastAfterTrafficFailures(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 1)
	base := time.Now()
	p.now = func() time.Time { return base }
	tripAllByTraffic(t, p, reg, 1)

	if _, err := p.HeadObject(context.Background(), "bucket", "k"); !errors.Is(err, ErrBackendsUnavailable) {
		t.Fatalf("expected fast-fail inside the shed window, got %v", err)
	}
	if st := p.PoolStats(); st.ShedRequests == 0 {
		t.Errorf("shed counter not incremented: %+v", st)
	}
	for _, f := range reg {
		f.calls.Store(0)
	}
	if _, err := p.HeadObject(context.Background(), "bucket", "k"); !errors.Is(err, ErrBackendsUnavailable) {
		t.Fatalf("expected continued shedding, got %v", err)
	}
	for ep, f := range reg {
		if f.calls.Load() != 0 {
			t.Errorf("shed request must not touch backend %s", ep)
		}
	}
}

func TestPool_CanaryAfterShedWindowRearmsOnFailure(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 1)
	base := time.Now()
	now := base
	p.now = func() time.Time { return now }
	tripAllByTraffic(t, p, reg, 1)

	now = base.Add(shedWindow + time.Second)
	for _, f := range reg {
		f.calls.Store(0)
	}
	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err == nil {
		t.Fatal("canary against dead backends must fail")
	}
	var canaried int64
	for _, f := range reg {
		canaried += f.calls.Load()
	}
	if canaried != 1 {
		t.Errorf("expected exactly 1 canary attempt, got %d", canaried)
	}
	if st := p.PoolStats(); st.CanaryRequests != 1 {
		t.Errorf("stats = %+v, want 1 canary", st)
	}
	// The canary's failure re-arms the window: the next request sheds.
	if _, err := p.HeadObject(context.Background(), "bucket", "k"); !errors.Is(err, ErrBackendsUnavailable) {
		t.Fatalf("expected shedding after failed canary, got %v", err)
	}
	if p.canaryInflight.Load() != 0 {
		t.Error("canary slot must be released after the attempt")
	}
}

func TestPool_CanarySuccessReinstatesThroughHalfOpen(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1)
	base := time.Now()
	now := base
	p.now = func() time.Time { return now }
	tripAllByTraffic(t, p, reg, 1)

	// Backend recovers, but probes still fail (e.g. sentinel bucket broken).
	reg["a"].opFail.Store(false)
	reg["a"].probeFail.Store(true)
	now = base.Add(shedWindow + time.Second)

	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err != nil {
		t.Fatalf("canary against recovered backend: %v", err)
	}
	b := backendByEndpoint(p, "a")
	if b.state.Load() != stateHalfOpen {
		t.Fatalf("canary success must move the backend to half-open, got %s", stateName(b.state.Load()))
	}
	if p.canaryInflight.Load() != 0 {
		t.Error("canary slot must be released")
	}
	// Trial traffic closes it.
	for range halfOpenCloseAfter {
		if _, err := p.HeadObject(context.Background(), "bucket", "k"); err != nil {
			t.Fatalf("trial request: %v", err)
		}
	}
	if b.state.Load() != stateClosed {
		t.Errorf("expected closed after %d trial successes, got %s", halfOpenCloseAfter, stateName(b.state.Load()))
	}
}

func TestPool_EjectAfterThresholdThenReinstate(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 3)
	b := backendByEndpoint(p, "a")
	if b.state.Load() != stateClosed {
		t.Fatal("backend should start closed after initial probe")
	}

	// Two failures: still closed (no immediate ejection).
	reg["a"].opFail.Store(true)
	_, _ = p.HeadObject(context.Background(), "bucket", "k")
	_, _ = p.HeadObject(context.Background(), "bucket", "k")
	if b.state.Load() != stateClosed {
		t.Error("ejected before reaching threshold")
	}
	// Third consecutive failure: ejected.
	_, _ = p.HeadObject(context.Background(), "bucket", "k")
	if b.state.Load() != stateOpen {
		t.Error("expected ejection after threshold failures")
	}
	if b.errors.Load() != 3 {
		t.Errorf("expected 3 recorded errors, got %d", b.errors.Load())
	}

	// A traffic-tripped backend re-earns closed through half-open trials, not
	// from the probe alone.
	reg["a"].opFail.Store(false)
	_ = p.Reconcile(context.Background())
	if b.state.Load() != stateHalfOpen {
		t.Fatalf("expected half-open after healthy probe, got %s", stateName(b.state.Load()))
	}
	if b.failures.Load() != 0 {
		t.Errorf("failure streak not reset, got %d", b.failures.Load())
	}
	for range halfOpenCloseAfter {
		_, _ = p.HeadObject(context.Background(), "bucket", "k")
	}
	if b.state.Load() != stateClosed {
		t.Errorf("expected closed after trials, got %s", stateName(b.state.Load()))
	}
}

func TestPool_HalfOpenTrialFailureReopens(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1)
	tripAllByTraffic(t, p, reg, 1)
	reg["a"].opFail.Store(false)
	_ = p.Reconcile(context.Background())
	b := backendByEndpoint(p, "a")
	if b.state.Load() != stateHalfOpen {
		t.Fatalf("expected half-open, got %s", stateName(b.state.Load()))
	}

	reg["a"].opFail.Store(true)
	_, _ = p.HeadObject(context.Background(), "bucket", "k")
	if b.state.Load() != stateOpen {
		t.Errorf("trial failure must reopen the backend, got %s", stateName(b.state.Load()))
	}
}

func TestPool_HalfOpenAdmitsOneTrialAtATime(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "h"}, 1)
	h := backendByEndpoint(p, "h")
	h.state.Store(stateHalfOpen)

	pk, err := p.pick()
	if err != nil {
		t.Fatalf("pick: %v", err)
	}
	if pk.b.endpoint != "h" || !pk.trial {
		t.Fatalf("expected the half-open backend to get a trial, got %q trial=%v", pk.b.endpoint, pk.trial)
	}
	for range 10 {
		next, err := p.pick()
		if err != nil {
			t.Fatalf("pick: %v", err)
		}
		if next.b.endpoint != "a" {
			t.Fatalf("only one concurrent trial is allowed, got %q", next.b.endpoint)
		}
	}
	p.release(pk)
	next, err := p.pick()
	if err != nil {
		t.Fatalf("pick: %v", err)
	}
	if next.b.endpoint != "h" || !next.trial {
		t.Errorf("freed trial slot must admit the next trial, got %q trial=%v", next.b.endpoint, next.trial)
	}
}

func TestPool_WindowedErrorRateEjectsBrownout(t *testing.T) {
	// Threshold high enough that the consecutive streak can never trip; the
	// alternating failure pattern is exactly what the sliding window catches.
	p, _, _ := newTestPool(t, []string{"a"}, 100)
	base := time.Now()
	p.now = func() time.Time { return base }
	b := backendByEndpoint(p, "a")

	for range windowMinRequests / 2 {
		p.recordResult(b, nil)
		p.recordResult(b, &genericError{msg: "dial tcp: connection refused"})
	}
	if b.state.Load() != stateOpen {
		t.Errorf("expected windowed ejection at 50%% failures over %d requests, got %s",
			windowMinRequests, stateName(b.state.Load()))
	}
	if !b.trafficTripped.Load() {
		t.Error("windowed ejection must mark the backend traffic-tripped")
	}
}

func TestPool_WindowForgetsOldFailures(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a"}, 100)
	base := time.Now()
	now := base
	p.now = func() time.Time { return now }
	b := backendByEndpoint(p, "a")

	for range (windowMinRequests / 2) - 1 {
		p.recordResult(b, nil)
		p.recordResult(b, &genericError{msg: "connection reset"})
	}
	if b.state.Load() != stateClosed {
		t.Fatalf("below min volume must not eject, got %s", stateName(b.state.Load()))
	}
	// Much later, a single failure: the old window has aged out entirely.
	now = base.Add(time.Hour)
	p.recordResult(b, &genericError{msg: "connection reset"})
	if b.state.Load() != stateClosed {
		t.Errorf("aged-out failures must not count toward ejection, got %s", stateName(b.state.Load()))
	}
}

func TestPool_ProbeFailureIgnoredWhileTrafficSucceeds(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 3)
	b := backendByEndpoint(p, "a")
	base := time.Now()
	p.now = func() time.Time { return base }

	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err != nil {
		t.Fatalf("HeadObject: %v", err)
	}
	reg["a"].probeFail.Store(true)
	_ = p.Reconcile(context.Background())
	if b.state.Load() != stateClosed {
		t.Errorf("probe failure must not eject a backend with healthy traffic, got %s", stateName(b.state.Load()))
	}
}

func TestPool_AppErrorDoesNotEject(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1) // threshold 1: any transport failure ejects
	b := backendByEndpoint(p, "a")

	// Make GetObject return a 404-style app error (not a backend failure).
	reg["a"].getErr = nil
	// Simulate via recordResult directly with an HTTP 404 error.
	p.recordResult(b, &httpError{statusCode: 404})
	if b.state.Load() != stateClosed {
		t.Error("app-level 404 must not eject the backend")
	}
	if b.failures.Load() != 0 {
		t.Errorf("404 must reset failure streak, got %d", b.failures.Load())
	}
}

func TestPool_GetObjectBodyAccounting(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a"}, 3)
	b := backendByEndpoint(p, "a")

	obj, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("GetObject: %v", err)
	}
	if b.inflight.Load() != 1 {
		t.Errorf("inflight should be 1 while body open, got %d", b.inflight.Load())
	}

	data, _ := io.ReadAll(obj.Body)
	if string(data) != "blobdata" {
		t.Errorf("body: got %q", data)
	}
	obj.Body.Close()

	if b.inflight.Load() != 0 {
		t.Errorf("inflight should return to 0 after close, got %d", b.inflight.Load())
	}
	if b.downloadedBytes.Load() != int64(len("blobdata")) {
		t.Errorf("downloadedBytes: got %d", b.downloadedBytes.Load())
	}
	if b.state.Load() != stateClosed {
		t.Error("clean download must keep backend healthy")
	}
}

func TestPool_GetObjectMidStreamErrorCountsFailure(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1) // threshold 1
	b := backendByEndpoint(p, "a")
	reg["a"].getErr = errors.New("connection reset")

	obj, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("GetObject: %v", err)
	}
	_, _ = io.ReadAll(obj.Body) // drains data then hits the injected error
	obj.Body.Close()

	if b.state.Load() != stateOpen {
		t.Error("mid-stream read failure should eject backend at threshold 1")
	}
	if b.errors.Load() != 1 {
		t.Errorf("expected 1 error recorded, got %d", b.errors.Load())
	}
}

func TestPool_ReconcileAddsAndRemoves(t *testing.T) {
	p, res, _ := newTestPool(t, []string{"a", "b"}, 3)
	if len(p.snapshot()) != 2 {
		t.Fatalf("expected 2 backends, got %d", len(p.snapshot()))
	}

	// Remove b, add c.
	res.set([]string{"a", "c"}, nil)
	_ = p.Reconcile(context.Background())

	eps := map[string]bool{}
	for _, b := range p.snapshot() {
		eps[b.endpoint] = true
	}
	if !eps["a"] || !eps["c"] || eps["b"] || len(eps) != 2 {
		t.Errorf("after reconcile expected {a,c}, got %v", eps)
	}
	// 'a' must be reused (same pointer survives) and stay closed.
	if backendByEndpoint(p, "a").state.Load() != stateClosed {
		t.Error("surviving backend 'a' should remain closed")
	}
	// 'c' is newly added and promoted straight to closed by the probe in the
	// same reconcile: a fresh backend has no traffic history to re-earn.
	if backendByEndpoint(p, "c").state.Load() != stateClosed {
		t.Error("new backend 'c' should be probed closed")
	}
}

func TestPool_ReconcileEjectsViaProbe(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	reg["a"].probeFail.Store(true)
	_ = p.Reconcile(context.Background())

	if backendByEndpoint(p, "a").state.Load() != stateOpen {
		t.Error("'a' should be ejected after failing probe")
	}
	if backendByEndpoint(p, "b").state.Load() != stateClosed {
		t.Error("'b' should remain closed")
	}

	// Recovery: probe passes again; a probe-only ejection closes directly,
	// without half-open trials.
	reg["a"].probeFail.Store(false)
	_ = p.Reconcile(context.Background())
	if backendByEndpoint(p, "a").state.Load() != stateClosed {
		t.Error("'a' should be reinstated after probe recovers")
	}
}

func TestPool_ReconcileKeepsSetOnResolverError(t *testing.T) {
	p, res, _ := newTestPool(t, []string{"a", "b"}, 3)
	res.set(nil, errors.New("dns down"))
	_ = p.Reconcile(context.Background())
	if len(p.snapshot()) != 2 {
		t.Errorf("resolver error should not drain pool; got %d backends", len(p.snapshot()))
	}
}

func TestPool_ReconcileKeepsSetOnEmptyResolve(t *testing.T) {
	p, res, _ := newTestPool(t, []string{"a", "b"}, 3)
	res.set([]string{}, nil)
	_ = p.Reconcile(context.Background())
	if len(p.snapshot()) != 2 {
		t.Errorf("empty resolve should not drain pool; got %d backends", len(p.snapshot()))
	}
}

func TestPool_ConcurrentRequestsDuringReconcile(t *testing.T) {
	p, res, _ := newTestPool(t, []string{"a", "b", "c"}, 3)

	var wg sync.WaitGroup
	stop := make(chan struct{})

	// Hammer the hot path from several goroutines.
	for range 8 {
		wg.Go(func() {
			for {
				select {
				case <-stop:
					return
				default:
				}
				_, _ = p.HeadObject(context.Background(), "bucket", "k")
				if obj, err := p.GetObject(context.Background(), "bucket", "k", ""); err == nil {
					_, _ = io.ReadAll(obj.Body)
					obj.Body.Close()
				}
			}
		})
	}

	// Concurrently churn the backend set and probe.
	wg.Go(func() {
		sets := [][]string{{"a", "b"}, {"a", "b", "c", "d"}, {"b", "c"}, {"a", "b", "c"}}
		for i := range 200 {
			select {
			case <-stop:
				return
			default:
			}
			res.set(sets[i%len(sets)], nil)
			_ = p.Reconcile(context.Background())
		}
	})

	time.Sleep(50 * time.Millisecond)
	close(stop)
	wg.Wait()
	// No assertion beyond "did not race/panic"; -race makes this meaningful.
}

func TestPool_StatsReflectActivity(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "b"}, 3)
	// Drive some successful ops.
	for range 4 {
		_, _ = p.HeadObject(context.Background(), "bucket", "k")
	}
	var totalReq int64
	stats := p.Stats()
	if len(stats) != 2 {
		t.Fatalf("expected 2 stats, got %d", len(stats))
	}
	for _, s := range stats {
		totalReq += s.Requests
		if !s.Healthy {
			t.Errorf("backend %s should be healthy", s.Endpoint)
		}
	}
	if totalReq != 4 {
		t.Errorf("expected 4 total requests across backends, got %d", totalReq)
	}
}

func intp(v int) *int { return &v }

func forcePick(p *Pool, ep string) {
	for _, b := range p.snapshot() {
		if b.endpoint != ep {
			b.inflight.Add(1)
		}
	}
}

func TestPool_RetryMasksSingleBackendFailure(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)

	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err != nil {
		t.Fatalf("expected retry on 'b' to mask the failure, got %v", err)
	}
	if got := reg["b"].calls.Load(); got != 1 {
		t.Errorf("expected exactly 1 call on 'b', got %d", got)
	}
	st := p.PoolStats()
	if st.RetryAttempts != 1 || st.RetrySuccesses != 1 || st.RetryDenied != 0 {
		t.Errorf("stats = %+v, want 1 attempt / 1 success / 0 denied", st)
	}
	if e := backendByEndpoint(p, "a").errors.Load(); e != 1 {
		t.Errorf("failed attempt must still count against 'a', got %d errors", e)
	}
}

func TestPool_NoRetryWithoutAnotherHealthyBackend(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	backendByEndpoint(p, "b").state.Store(stateOpen)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)

	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err == nil {
		t.Fatal("expected the failure to surface with no healthy sibling")
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("unhealthy 'b' must not receive the retry, got %d calls", got)
	}
	st := p.PoolStats()
	if st.RetryAttempts != 0 || st.RetryDenied != 0 {
		t.Errorf("stats = %+v, want no attempts and no budget spend", st)
	}
	if st.RetryBudget != p.retryBudgetCap {
		t.Errorf("budget must be untouched when there is nothing to retry onto, got %d", st.RetryBudget)
	}
}

func TestPool_RetryDeniedWhenBudgetExhausted(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	p.budget.Store(0)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)

	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err == nil {
		t.Fatal("expected the failure to surface with an empty budget")
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("'b' must not be tried without budget, got %d calls", got)
	}
	if st := p.PoolStats(); st.RetryDenied != 1 || st.RetryAttempts != 0 {
		t.Errorf("stats = %+v, want 1 denied / 0 attempts", st)
	}
}

func TestPool_SuccessesRefillRetryBudget(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "b"}, 3)
	p.budget.Store(0)
	for range p.retryTokenCost {
		_, _ = p.HeadObject(context.Background(), "bucket", "k")
	}
	if got := p.PoolStats().RetryBudget; got != p.retryTokenCost*p.retryTokenEarn {
		t.Errorf("budget after %d successes = %d, want %d", p.retryTokenCost, got, p.retryTokenCost*p.retryTokenEarn)
	}

	p.budget.Store(p.retryBudgetCap - 1)
	for range 5 {
		_, _ = p.HeadObject(context.Background(), "bucket", "k")
	}
	if got := p.PoolStats().RetryBudget; got != p.retryBudgetCap {
		t.Errorf("budget must cap at %d, got %d", p.retryBudgetCap, got)
	}
}

func TestPool_PutObjectNeverRetries(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)

	err := p.PutObject(context.Background(), "bucket", "k", strings.NewReader("x"), 1, true, "")
	if err == nil {
		t.Fatal("expected PUT failure to surface")
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("PUT must never move to another backend (body already consumed), got %d calls", got)
	}
	if st := p.PoolStats(); st.RetryAttempts != 0 {
		t.Errorf("stats = %+v, want no retry attempts", st)
	}
}

func TestPool_CreateBucketNeverRetries(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)

	if err := p.CreateBucket(context.Background(), "bucket"); err == nil {
		t.Fatal("expected create failure to surface")
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("non-idempotent create must not retry, got %d calls", got)
	}
}

func TestPool_ListRetriesWhenNothingEmitted(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].listFailAfterEmitting = intp(0)
	reg["b"].listItems = []BlobInfo{{Name: "data/aa", Size: 1}}

	var got []BlobInfo
	err := p.ListObjects(context.Background(), "bucket", "data/", func(b BlobInfo) error {
		got = append(got, b)
		return nil
	})
	if err != nil {
		t.Fatalf("expected retried listing to succeed, got %v", err)
	}
	if len(got) != 1 || got[0].Name != "data/aa" {
		t.Errorf("expected 'b' listing, got %v", got)
	}
	if st := p.PoolStats(); st.RetryAttempts != 1 || st.RetrySuccesses != 1 {
		t.Errorf("stats = %+v, want 1 attempt / 1 success", st)
	}
}

func TestPool_ListDoesNotRetryAfterEmitting(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].listItems = []BlobInfo{{Name: "data/aa", Size: 1}, {Name: "data/bb", Size: 2}}
	reg["a"].listFailAfterEmitting = intp(1)

	emitted := 0
	err := p.ListObjects(context.Background(), "bucket", "data/", func(BlobInfo) error {
		emitted++
		return nil
	})
	if err == nil {
		t.Fatal("mid-listing failure must surface: emitted entries cannot be taken back")
	}
	if emitted != 1 {
		t.Errorf("expected 1 emitted entry before the failure, got %d", emitted)
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("'b' must not be tried after emission, got %d calls", got)
	}
}

func TestPool_GetObjectRetriesHeaderPhase(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)

	obj, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("expected header-phase retry to succeed, got %v", err)
	}
	data, _ := io.ReadAll(obj.Body)
	obj.Body.Close()
	if string(data) != "blobdata" {
		t.Errorf("body = %q, want 'b' backend's blob", data)
	}
	if st := p.PoolStats(); st.RetryAttempts != 1 || st.RetrySuccesses != 1 {
		t.Errorf("stats = %+v, want 1 attempt / 1 success", st)
	}
}

func TestPool_GetObjectMidStreamFailureDoesNotRetry(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].getErr = errors.New("connection reset")

	obj, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("GetObject: %v", err)
	}
	_, _ = io.ReadAll(obj.Body)
	obj.Body.Close()

	if st := p.PoolStats(); st.RetryAttempts != 0 {
		t.Errorf("mid-stream failure must not retry, stats = %+v", st)
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("'b' must not be called, got %d", got)
	}
}

func TestPool_NoRetryAfterContextCancelled(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	forcePick(p, "a")
	reg["a"].opFail.Store(true)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := p.HeadObject(ctx, "bucket", "k"); err == nil {
		t.Fatal("expected failure")
	}
	if st := p.PoolStats(); st.RetryAttempts != 0 {
		t.Errorf("a gone caller must not trigger retries, stats = %+v", st)
	}
	if got := reg["b"].calls.Load(); got != 0 {
		t.Errorf("'b' must not be called, got %d", got)
	}
}

// slowProbeStore blocks each probe until its context is cancelled — an
// unreachable, blackholed backend that eats the whole probe budget.
type slowProbeStore struct {
	fakeStore
}

func (s *slowProbeStore) Probe(ctx context.Context, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

// Probes must run concurrently and be bounded by probeTimeout: N unreachable
// backends cost one timeout, not N — serial unbounded probes once pushed pool
// init past the kubelet startup budget and crash-looped the deployment.
func TestPool_ProbesConcurrentAndBounded(t *testing.T) {
	const n = 8
	eps := make([]string, n)
	stores := make([]*slowProbeStore, n)
	for i := range n {
		eps[i] = string(rune('a' + i))
		stores[i] = &slowProbeStore{}
	}
	i := 0
	factory := func(ep string) (Storage, error) {
		s := stores[i]
		i++
		s.endpoint = ep
		return s, nil
	}
	start := time.Now()
	p, err := NewPool(PoolConfig{EjectThreshold: 3, ReconcileInterval: time.Hour},
		factory, &testResolver{eps: eps}, zerolog.Nop())
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	elapsed := time.Since(start)
	if elapsed > probeTimeout+2*time.Second {
		t.Errorf("pool init took %v; serial probing suspected (budget %v)", elapsed, probeTimeout)
	}
	// Cross-store overlap shows in wall-clock: all N probes block until their
	// per-probe deadline, so init must take ~one probeTimeout, not N of them.
	if elapsed < probeTimeout {
		t.Errorf("probes returned before the timeout cancelled them (%v)", elapsed)
	}
	for _, b := range p.snapshot() {
		if b.state.Load() != stateOpen {
			t.Errorf("backend %s should be open after timed-out probe", b.endpoint)
		}
	}
}

func TestPool_RetryBudgetKnobsConfigurable(t *testing.T) {
	p, _, reg := newTestPoolCfg(t, []string{"a", "b"}, PoolConfig{
		EjectThreshold:    3,
		ReconcileInterval: time.Hour,
		RetryTokenEarn:    5,
		RetryTokenCost:    20,
		RetryBudgetCap:    40,
	})
	if got := p.PoolStats().RetryBudget; got != 40 {
		t.Fatalf("budget must start at the configured cap, got %d", got)
	}
	forcePick(p, "a")
	reg["a"].opFail.Store(true)
	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err != nil {
		t.Fatalf("expected retry to succeed: %v", err)
	}
	if got := p.PoolStats().RetryBudget; got != 40-20+5 {
		t.Errorf("budget after one retry (-20) and its success (+5) = %d, want 25", got)
	}
}

func TestPool_CanaryGetReleasesSlotAtHeaders(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1)
	base := time.Now()
	now := base
	p.now = func() time.Time { return now }
	tripAllByTraffic(t, p, reg, 1)
	reg["a"].opFail.Store(false)
	reg["a"].probeFail.Store(true)
	now = base.Add(shedWindow + time.Second)

	obj, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("canary GetObject: %v", err)
	}
	if p.canaryInflight.Load() != 0 {
		t.Error("canary slot must be freed once headers arrive, not held for the body stream")
	}
	b := backendByEndpoint(p, "a")
	if b.state.Load() != stateHalfOpen {
		t.Errorf("headers from an open backend must admit trial traffic, got %s", stateName(b.state.Load()))
	}
	_, _ = io.ReadAll(obj.Body)
	obj.Body.Close()
	if b.state.Load() != stateHalfOpen {
		t.Errorf("clean body close must keep the backend half-open, got %s", stateName(b.state.Load()))
	}
	if got := b.halfOpenSuccesses.Load(); got != 1 {
		t.Errorf("one canary GET must count exactly one trial success, got %d", got)
	}
}

func TestPool_TrialsAndCanariesBoundedWhileStreaming(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1)
	base := time.Now()
	now := base
	p.now = func() time.Time { return now }
	tripAllByTraffic(t, p, reg, 1)
	reg["a"].opFail.Store(false)
	reg["a"].probeFail.Store(true)
	now = base.Add(shedWindow + time.Second)

	canary, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("canary GetObject: %v", err)
	}
	trial, err := p.GetObject(context.Background(), "bucket", "k", "")
	if err != nil {
		t.Fatalf("trial GetObject: %v", err)
	}
	if _, err := p.HeadObject(context.Background(), "bucket", "k"); !errors.Is(err, ErrBackendsUnavailable) {
		t.Fatalf("expected shed with the trial slot taken and no open backend left, got %v", err)
	}
	_, _ = io.ReadAll(trial.Body)
	trial.Body.Close()
	if _, err := p.HeadObject(context.Background(), "bucket", "k"); err != nil {
		t.Fatalf("freed trial slot must admit the next trial: %v", err)
	}
	_, _ = io.ReadAll(canary.Body)
	canary.Body.Close()
}
