package metrics

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"michael/internal/auth"

	otelmetric "go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/metric/embedded"
	"go.opentelemetry.io/otel/metric/noop"
)

// observation is one captured ObserveInt64 call. The option is retained, not
// decoded: each label set is built once per tracker entry, so identity-comparable.
type observation struct {
	value int64
	opt   otelmetric.ObserveOption
}

type recordingObserver struct {
	embedded.Observer
	got []observation
}

func (r *recordingObserver) ObserveFloat64(otelmetric.Float64Observable, float64, ...otelmetric.ObserveOption) {
}

func (r *recordingObserver) ObserveInt64(_ otelmetric.Int64Observable, value int64, opts ...otelmetric.ObserveOption) {
	var opt otelmetric.ObserveOption
	if len(opts) > 0 {
		opt = opts[0]
	}
	r.got = append(r.got, observation{value, opt})
}

// testGauge is the instrument handed to observe(); its identity is all the
// tracker uses.
func testGauge(t *testing.T) otelmetric.Int64ObservableGauge {
	t.Helper()
	gauge, err := noop.NewMeterProvider().Meter("test").Int64ObservableGauge("test")
	if err != nil {
		t.Fatalf("unexpected error creating gauge: %v", err)
	}
	return gauge
}

func collect(t *testing.T, tr *clientTracker, now time.Time) []observation {
	t.Helper()
	obs := &recordingObserver{}
	tr.observe(obs, testGauge(t), now)
	return obs.got
}

// peakFor returns the observed high-water mark for one client, matching on the
// label set held by that client's tracker entry.
func peakFor(t *testing.T, tr *clientTracker, got []observation, key clientAttrKey) int64 {
	t.Helper()
	v, ok := tr.states.Load(key)
	if !ok {
		t.Fatalf("no tracker entry for %+v", key)
	}
	var want otelmetric.ObserveOption = v.(*clientConcurrency).attrs
	for _, o := range got {
		if o.opt == want {
			return o.value
		}
	}
	t.Fatalf("no observation for %+v", key)
	return 0
}

func TestClientAttrsBuiltOncePerClient(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "immich"}

	first := tr.enter(key)
	if second := tr.enter(key); second.attrs != first.attrs {
		t.Fatal("expected repeat requests to reuse the client's label set")
	}

	for _, other := range []clientAttrKey{
		{"u2", "r1", "immich"},
		{"u1", "r2", "immich"},
		{"u1", "r1", "restic"},
	} {
		if tr.enter(other).attrs == first.attrs {
			t.Fatalf("expected %+v to get its own label set", other)
		}
	}
}

// TestClientAttrsReclaimedOnEviction is the memory bound: label set lives on
// the entry, so an idle client leaves nothing (an identity-keyed cache would
// retain every pair ever seen).
func TestClientAttrsReclaimedOnEviction(t *testing.T) {
	tr := &clientTracker{}
	now := time.Now()

	for _, key := range []clientAttrKey{{"u1", "r1", "restic"}, {"u2", "r2", "immich"}} {
		tr.enter(key).exit(now)
	}
	collect(t, tr, now)                                // drain each peak to 0
	collect(t, tr, now.Add(clientIdleTTL+time.Minute)) // evict

	count := 0
	tr.states.Range(func(any, any) bool { count++; return true })
	if count != 0 {
		t.Fatalf("expected every label set to be reclaimed, got %d retained", count)
	}
}

func TestClientConcurrencyTracksHighWater(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "restic"}

	first := tr.enter(key)
	second := tr.enter(key)
	third := tr.enter(key)
	third.exit(time.Now())
	second.exit(time.Now())

	// Re-entering after a partial drain must not pull the high-water mark down
	// to the new, lower concurrency: the window peaked at 3.
	fourth := tr.enter(key)

	if peak := peakFor(t, tr, collect(t, tr, time.Now()), key); peak != 3 {
		t.Fatalf("expected peak 3, got %d", peak)
	}

	// The window resets to what is still outstanding, not to zero.
	if peak := peakFor(t, tr, collect(t, tr, time.Now()), key); peak != 2 {
		t.Fatalf("expected peak to reset to the outstanding count 2, got %d", peak)
	}

	first.exit(time.Now())
	fourth.exit(time.Now())
	if peak := peakFor(t, tr, collect(t, tr, time.Now()), key); peak != 2 {
		t.Fatalf("expected the window those requests spanned to report 2, got %d", peak)
	}
	if peak := peakFor(t, tr, collect(t, tr, time.Now()), key); peak != 0 {
		t.Fatalf("expected an idle client to report 0, got %d", peak)
	}
}

func TestClientTrackerSeparatesClients(t *testing.T) {
	tr := &clientTracker{}
	tr.enter(clientAttrKey{"u1", "r1", "restic"})
	tr.enter(clientAttrKey{"u1", "r2", "restic"})
	tr.enter(clientAttrKey{"u2", "r3", "immich"})

	got := collect(t, tr, time.Now())
	if len(got) != 3 {
		t.Fatalf("expected 3 tracked clients, got %d", len(got))
	}
	for _, key := range []clientAttrKey{
		{"u1", "r1", "restic"},
		{"u1", "r2", "restic"},
		{"u2", "r3", "immich"},
	} {
		if peak := peakFor(t, tr, got, key); peak != 1 {
			t.Fatalf("expected %+v at peak 1, got %d", key, peak)
		}
	}
}

func TestClientTrackerEvictsIdleClients(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "restic"}

	state := tr.enter(key)
	now := time.Now()
	state.exit(now)

	// Still inside the TTL, and the window's peak is not yet drained.
	if got := collect(t, tr, now); len(got) != 1 {
		t.Fatalf("expected the client to survive its first collection, got %d", len(got))
	}
	// Peak has drained to 0 but the TTL has not elapsed.
	if got := collect(t, tr, now); len(got) != 1 {
		t.Fatalf("expected the client to survive inside the TTL, got %d", len(got))
	}
	if got := collect(t, tr, now.Add(clientIdleTTL+time.Minute)); len(got) != 0 {
		t.Fatalf("expected the idle client to be evicted, got %d", len(got))
	}

	count := 0
	tr.states.Range(func(any, any) bool { count++; return true })
	if count != 0 {
		t.Fatalf("expected the tracker map to be empty, got %d entries", count)
	}
}

// TestClientTrackerEvictionDoesNotSplitClient drives the eviction race by hand:
// a request lands after a collection deems the entry idle. The client must end
// on ONE entry — an orphan/replacement split would under-report concurrency.
func TestClientTrackerEvictionDoesNotSplitClient(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "restic"}

	tr.enter(key).exit(time.Now())
	v, _ := tr.states.Load(key)
	idle := v.(*clientConcurrency)

	// The collection retires the entry, then the request lands before the map
	// delete would have run.
	if !idle.retire() {
		t.Fatal("expected an idle entry to retire")
	}
	racing := tr.enter(key)
	if racing == idle {
		t.Fatal("expected the retired entry to be replaced, not reused")
	}

	// The delete now arrives; it must not take the replacement with it.
	tr.states.CompareAndDelete(key, idle)

	current, ok := tr.states.Load(key)
	if !ok {
		t.Fatal("expected the replacement to survive the delete")
	}
	if current.(*clientConcurrency) != racing {
		t.Fatal("expected the map to hold the entry the request is using")
	}

	// A later request must join the same entry rather than start a third one.
	if next := tr.enter(key); next != racing {
		t.Fatal("expected later requests to share the replacement")
	}
	if cur := racing.cur.Load(); cur != 2 {
		t.Fatalf("expected both requests on one entry, got %d", cur)
	}
	if peak := peakFor(t, tr, collect(t, tr, time.Now()), key); peak != 2 {
		t.Fatalf("expected the peak to see both requests, got %d", peak)
	}
}

// TestClientTrackerEvictionKeepsRequestsAttached races eviction against enter
// with the clock always past TTL. Invariant (what the retire handshake buys):
// entries retire only while idle, so an outstanding request still finds its
// state in the map. Deleting on the idle read alone would orphan it and split
// the client's concurrency.
func TestClientTrackerEvictionKeepsRequestsAttached(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "restic"}
	gauge := testGauge(t)

	var orphaned atomic.Int64
	done := make(chan struct{})
	var collectors, requests sync.WaitGroup

	// Collect for as long as requests are arriving, so the two actually overlap.
	collectors.Add(1)
	go func() {
		defer collectors.Done()
		obs := &recordingObserver{}
		for {
			select {
			case <-done:
				return
			default:
				tr.observe(obs, gauge, time.Now().Add(2*clientIdleTTL))
				obs.got = obs.got[:0]
			}
		}
	}()

	for i := 0; i < 4; i++ {
		requests.Add(1)
		go func() {
			defer requests.Done()
			for n := 0; n < 20000; n++ {
				state := tr.enter(key)
				if v, ok := tr.states.Load(key); !ok || v.(*clientConcurrency) != state {
					orphaned.Add(1)
				}
				state.exit(time.Now())
			}
		}()
	}

	requests.Wait()
	close(done)
	collectors.Wait()

	if got := orphaned.Load(); got != 0 {
		t.Fatalf("expected outstanding requests to stay attached to the mapped entry, got %d orphaned", got)
	}
}

func TestClientConcurrencyRetireRequiresIdle(t *testing.T) {
	c := &clientConcurrency{}
	if !c.enter() {
		t.Fatal("expected enter to succeed on a fresh entry")
	}
	if c.retire() {
		t.Fatal("expected retire to fail while a request is outstanding")
	}

	c.exit(time.Now())
	if !c.retire() {
		t.Fatal("expected retire to succeed once idle")
	}
	if c.enter() {
		t.Fatal("expected enter to fail on a retired entry")
	}
}

func TestClientTrackerKeepsBusyClients(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "restic"}
	tr.enter(key)

	// lastSeen is only stamped on exit, so a client that has been holding a
	// request open longer than the TTL must not be evicted underneath it.
	if got := collect(t, tr, time.Now().Add(24*time.Hour)); len(got) != 1 {
		t.Fatalf("expected a client with an outstanding request to survive, got %d", len(got))
	}
}

func TestClientTrackerConcurrentEnterExit(t *testing.T) {
	tr := &clientTracker{}
	key := clientAttrKey{"u1", "r1", "restic"}

	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tr.enter(key).exit(time.Now())
		}()
	}
	wg.Wait()

	v, ok := tr.states.Load(key)
	if !ok {
		t.Fatal("expected the client to be tracked")
	}
	if cur := v.(*clientConcurrency).cur.Load(); cur != 0 {
		t.Fatalf("expected every request to be accounted out, got %d outstanding", cur)
	}
}

func TestNewClientMetricsWithNoopMeter(t *testing.T) {
	c, err := newClientMetrics(noop.NewMeterProvider().Meter("test"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.seconds == nil || c.ttfbSeconds == nil || c.tracker == nil {
		t.Fatal("expected fully populated clientMetrics")
	}
}

// TestMiddlewareTracksConcurrency drives the real middleware chain: CaptureAuth
// must enter the tracker and Middleware must account the request back out.
func TestMiddlewareTracksConcurrency(t *testing.T) {
	m, err := NewMetrics(noop.NewMeterProvider().Meter("test"))
	if err != nil {
		t.Fatal(err)
	}

	key := clientAttrKey{"u1", "r1", "restic"}
	var insidePeak int64
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if v, ok := m.client.tracker.states.Load(key); ok {
			insidePeak = v.(*clientConcurrency).cur.Load()
		}
		w.WriteHeader(http.StatusOK)
	})

	handler := Middleware(m)(CaptureAuth(inner))

	req := httptest.NewRequest("GET", "/r1/config", nil)
	req = req.WithContext(auth.NewContext(req.Context(),
		auth.Auth{User: "u1", Repository: "r1", Connection: "restic"}))
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if insidePeak != 1 {
		t.Fatalf("expected 1 request in flight inside the handler, got %d", insidePeak)
	}

	v, ok := m.client.tracker.states.Load(key)
	if !ok {
		t.Fatal("expected the client to be tracked")
	}
	if cur := v.(*clientConcurrency).cur.Load(); cur != 0 {
		t.Fatalf("expected the request to be accounted out, got %d outstanding", cur)
	}
	if peak := v.(*clientConcurrency).peak.Load(); peak != 1 {
		t.Fatalf("expected peak 1, got %d", peak)
	}
}

// TestMiddlewareAccountsOutOnPanic: chi's Recoverer is mounted outside us, so a
// handler panic unwinds past this middleware; without the deferred exit the
// request stays counted forever, pinning peak >0 and blocking idle eviction.
func TestMiddlewareAccountsOutOnPanic(t *testing.T) {
	m, err := NewMetrics(noop.NewMeterProvider().Meter("test"))
	if err != nil {
		t.Fatal(err)
	}

	inner := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	})
	handler := Middleware(m)(CaptureAuth(inner))

	req := httptest.NewRequest("GET", "/r1/config", nil)
	req = req.WithContext(auth.NewContext(req.Context(),
		auth.Auth{User: "u1", Repository: "r1", Connection: "restic"}))

	func() {
		defer func() {
			if recover() == nil {
				t.Error("expected the panic to propagate to the outer Recoverer")
			}
		}()
		handler.ServeHTTP(httptest.NewRecorder(), req)
	}()

	v, ok := m.client.tracker.states.Load(clientAttrKey{"u1", "r1", "restic"})
	if !ok {
		t.Fatal("expected the client to be tracked")
	}
	if cur := v.(*clientConcurrency).cur.Load(); cur != 0 {
		t.Fatalf("expected the panicking request to be accounted out, got %d outstanding", cur)
	}
}

// TestMiddlewareSkipsUnauthenticated: unauthenticated traffic has no identity
// and must not accumulate under an empty key.
func TestMiddlewareSkipsUnauthenticated(t *testing.T) {
	m, err := NewMetrics(noop.NewMeterProvider().Meter("test"))
	if err != nil {
		t.Fatal(err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	handler := Middleware(m)(inner)
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/r1/config", nil))

	count := 0
	m.client.tracker.states.Range(func(any, any) bool { count++; return true })
	if count != 0 {
		t.Fatalf("expected no tracked clients, got %d", count)
	}
}
