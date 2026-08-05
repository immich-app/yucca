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

func (f *fakeStore) ListObjects(_ context.Context, _, _ string, _ func(BlobInfo) error) error {
	f.calls.Add(1)
	if f.opFail.Load() {
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
	var rc io.ReadCloser = io.NopCloser(strings.NewReader(f.getBody))
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
	p, err := NewPool(PoolConfig{EjectThreshold: threshold, ReconcileInterval: time.Hour}, factory, res, zerolog.Nop())
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
	got := p.pick()
	if got.endpoint != "b" {
		t.Errorf("pick: expected least-loaded 'b', got %q", got.endpoint)
	}
}

func TestPool_PickTiebreakRotates(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "b", "c"}, 3)
	// All equal load => tiebreak should rotate across backends.
	seen := map[string]int{}
	for range 30 {
		seen[p.pick().endpoint]++
	}
	if len(seen) < 2 {
		t.Errorf("tiebreak did not rotate; only hit %v", seen)
	}
}

func TestPool_PickFailsOpenWhenAllUnhealthy(t *testing.T) {
	p, _, _ := newTestPool(t, []string{"a", "b"}, 3)
	for _, b := range p.snapshot() {
		b.healthy.Store(false)
		b.inflight.Store(7)
	}
	backendByEndpoint(p, "b").inflight.Store(1) // least loaded
	got := p.pick()
	if got == nil {
		t.Fatal("fail-open: expected a backend, got nil")
	}
	if got.endpoint != "b" {
		t.Errorf("fail-open: expected least-loaded 'b', got %q", got.endpoint)
	}
}

func TestPool_EjectAfterThresholdThenReinstate(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 3)
	b := backendByEndpoint(p, "a")
	if !b.healthy.Load() {
		t.Fatal("backend should start healthy after initial probe")
	}

	// Two failures: still healthy (no immediate ejection).
	reg["a"].opFail.Store(true)
	p.HeadObject(context.Background(), "bucket", "k")
	p.HeadObject(context.Background(), "bucket", "k")
	if !b.healthy.Load() {
		t.Error("ejected before reaching threshold")
	}
	// Third consecutive failure: ejected.
	p.HeadObject(context.Background(), "bucket", "k")
	if b.healthy.Load() {
		t.Error("expected ejection after threshold failures")
	}
	if b.errors.Load() != 3 {
		t.Errorf("expected 3 recorded errors, got %d", b.errors.Load())
	}

	// Active probe reinstates once the backend recovers.
	reg["a"].opFail.Store(false)
	p.Reconcile(context.Background())
	if !b.healthy.Load() {
		t.Error("expected reinstatement after healthy probe")
	}
	if b.failures.Load() != 0 {
		t.Errorf("failure streak not reset, got %d", b.failures.Load())
	}
}

func TestPool_AppErrorDoesNotEject(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a"}, 1) // threshold 1: any transport failure ejects
	b := backendByEndpoint(p, "a")

	// Make GetObject return a 404-style app error (not a backend failure).
	reg["a"].getErr = nil
	// Simulate via recordResult directly with an HTTP 404 error.
	p.recordResult(b, &httpError{statusCode: 404})
	if !b.healthy.Load() {
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
	if b.healthy.Load() != true {
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

	if b.healthy.Load() {
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
	p.Reconcile(context.Background())

	eps := map[string]bool{}
	for _, b := range p.snapshot() {
		eps[b.endpoint] = true
	}
	if !eps["a"] || !eps["c"] || eps["b"] || len(eps) != 2 {
		t.Errorf("after reconcile expected {a,c}, got %v", eps)
	}
	// 'a' must be reused (same pointer survives) and stay healthy.
	if !backendByEndpoint(p, "a").healthy.Load() {
		t.Error("surviving backend 'a' should remain healthy")
	}
	// 'c' is newly added and promoted by the probe in the same reconcile.
	if !backendByEndpoint(p, "c").healthy.Load() {
		t.Error("new backend 'c' should be probed healthy")
	}
}

func TestPool_ReconcileEjectsViaProbe(t *testing.T) {
	p, _, reg := newTestPool(t, []string{"a", "b"}, 3)
	reg["a"].probeFail.Store(true)
	p.Reconcile(context.Background())

	if backendByEndpoint(p, "a").healthy.Load() {
		t.Error("'a' should be ejected after failing probe")
	}
	if !backendByEndpoint(p, "b").healthy.Load() {
		t.Error("'b' should remain healthy")
	}

	// Recovery: probe passes again, backend reinstated.
	reg["a"].probeFail.Store(false)
	p.Reconcile(context.Background())
	if !backendByEndpoint(p, "a").healthy.Load() {
		t.Error("'a' should be reinstated after probe recovers")
	}
}

func TestPool_ReconcileKeepsSetOnResolverError(t *testing.T) {
	p, res, _ := newTestPool(t, []string{"a", "b"}, 3)
	res.set(nil, errors.New("dns down"))
	p.Reconcile(context.Background())
	if len(p.snapshot()) != 2 {
		t.Errorf("resolver error should not drain pool; got %d backends", len(p.snapshot()))
	}
}

func TestPool_ReconcileKeepsSetOnEmptyResolve(t *testing.T) {
	p, res, _ := newTestPool(t, []string{"a", "b"}, 3)
	res.set([]string{}, nil)
	p.Reconcile(context.Background())
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
				p.HeadObject(context.Background(), "bucket", "k")
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
			p.Reconcile(context.Background())
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
		p.HeadObject(context.Background(), "bucket", "k")
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

// slowProbeStore blocks each probe until its context is cancelled — an
// unreachable, blackholed backend that eats the whole probe budget.
type slowProbeStore struct {
	fakeStore
}

func (s *slowProbeStore) Probe(ctx context.Context, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

// Probes run concurrently, bounded by probeTimeout: N unreachable backends cost
// one timeout, not N (serial unbounded probes once crash-looped startup).
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
		if b.healthy.Load() {
			t.Errorf("backend %s should be unhealthy after timed-out probe", b.endpoint)
		}
	}
}
