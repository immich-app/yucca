package metrics

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"go.opentelemetry.io/otel/attribute"
	otelmetric "go.opentelemetry.io/otel/metric"
)

// clientIdleTTL bounds idle-client retention in the tracker; only needs to
// outlive a collection gap — returning clients reuse their entry.
const clientIdleTTL = 15 * time.Minute

type clientAttrKey struct{ user, repository, connection string }

// clientAttrs: identity only — no method/route/status — so per-client
// instruments stay a fixed handful of series per client-repository.
func clientAttrs(key clientAttrKey) otelmetric.MeasurementOption {
	return otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("customerId", key.user),
		attribute.String("repositoryId", key.repository),
		attribute.String("connection", key.connection),
	))
}

// clientConcurrency: cur = live count, peak = high-water since last collection.
// The label set lives here (not a separate cache) so it's reclaimed on idle
// eviction instead of growing with every pair ever seen.
type clientConcurrency struct {
	attrs    otelmetric.MeasurementOption
	cur      atomic.Int64
	peak     atomic.Int64
	lastSeen atomic.Int64 // unix nanos, stamped when a request finishes
}

// retired is a state of cur (not a separate flag) so close+observe-idle is one
// atomic step; otherwise a racing request could land on an entry leaving the map.
const retired = -1

// enter accounts a request start, raising the window high-water mark; false if
// the entry is retired (caller takes a fresh one).
func (c *clientConcurrency) enter() bool {
	for {
		cur := c.cur.Load()
		if cur == retired {
			return false
		}
		if c.cur.CompareAndSwap(cur, cur+1) {
			c.raisePeak(cur + 1)
			return true
		}
	}
}

func (c *clientConcurrency) raisePeak(cur int64) {
	for {
		peak := c.peak.Load()
		if cur <= peak || c.peak.CompareAndSwap(peak, cur) {
			return
		}
	}
}

// retire closes the entry to new requests, and only succeeds while nothing is
// outstanding.
func (c *clientConcurrency) retire() bool {
	return c.cur.CompareAndSwap(0, retired)
}

func (c *clientConcurrency) exit(now time.Time) {
	c.cur.Add(-1)
	c.lastSeen.Store(now.UnixNano())
}

type clientTracker struct {
	states sync.Map // clientAttrKey -> *clientConcurrency
}

// enter loads before storing (hot path = one map read; labels built on first
// sight). Losing the race with a retiring collection costs one iteration; all
// later requests share the replacement — a split orphan/successor would
// under-report concurrency.
func (t *clientTracker) enter(key clientAttrKey) *clientConcurrency {
	for {
		v, ok := t.states.Load(key)
		if !ok {
			v, _ = t.states.LoadOrStore(key, newClientConcurrency(key))
		}
		state := v.(*clientConcurrency)
		if state.enter() {
			return state
		}
		t.states.CompareAndSwap(key, state, newClientConcurrency(key))
	}
}

// newClientConcurrency stamps lastSeen so a fresh entry can't look idle before
// its first request is accounted in.
func newClientConcurrency(key clientAttrKey) *clientConcurrency {
	state := &clientConcurrency{attrs: clientAttrs(key)}
	state.lastSeen.Store(time.Now().UnixNano())
	return state
}

// observe reports each client's high-water concurrency and arms the next
// window. Peak resets to CURRENT outstanding, not zero: restic holds N
// connections a whole backup and would otherwise report N once then 0.
func (t *clientTracker) observe(o otelmetric.Observer, gauge otelmetric.Int64ObservableGauge, now time.Time) {
	t.states.Range(func(k, v any) bool {
		key := k.(clientAttrKey)
		state := v.(*clientConcurrency)

		cur := state.cur.Load()
		peak := state.peak.Swap(cur)

		// Retire before delete, delete only the retired entry: a racing request
		// either wins (retire fails) or gets the replacement it swapped in.
		if cur == 0 && peak == 0 && now.UnixNano()-state.lastSeen.Load() > int64(clientIdleTTL) {
			if state.retire() {
				t.states.CompareAndDelete(key, state)
			}
			return true
		}

		o.ObserveInt64(gauge, peak, state.attrs)
		return true
	})
}

// clientMetrics measures how each client drives the gateway (vs per-route perf).
// Little's Law: rate(client.request.seconds) = mean in-flight requests; divided
// by request rate = mean duration. `peak` catches bursty saturation an average
// hides; it is per replica (summed peak = upper bound, the average sums exactly).
type clientMetrics struct {
	seconds     otelmetric.Float64Counter
	ttfbSeconds otelmetric.Float64Counter
	tracker     *clientTracker
}

func newClientMetrics(meter otelmetric.Meter) (*clientMetrics, error) {
	seconds, err := meter.Float64Counter("client.request.seconds",
		otelmetric.WithDescription("Accumulated request-seconds per client; its rate is average parallelism"),
		otelmetric.WithUnit("s"))
	if err != nil {
		return nil, fmt.Errorf("creating client.request.seconds counter: %w", err)
	}

	// Duration includes body drain (client's link on large blobs); TTFB isolates
	// michael+RGW. Per client: slow customer vs slow backend.
	ttfbSeconds, err := meter.Float64Counter("client.request.ttfb_seconds",
		otelmetric.WithDescription("Accumulated time-to-first-byte seconds per client"),
		otelmetric.WithUnit("s"))
	if err != nil {
		return nil, fmt.Errorf("creating client.request.ttfb_seconds counter: %w", err)
	}

	peak, err := meter.Int64ObservableGauge("client.requests.peak",
		otelmetric.WithDescription("Highest number of concurrent requests per client since the last collection"))
	if err != nil {
		return nil, fmt.Errorf("creating client.requests.peak gauge: %w", err)
	}

	c := &clientMetrics{seconds: seconds, ttfbSeconds: ttfbSeconds, tracker: &clientTracker{}}

	if _, err := meter.RegisterCallback(
		func(_ context.Context, o otelmetric.Observer) error {
			c.tracker.observe(o, peak, time.Now())
			return nil
		},
		peak,
	); err != nil {
		return nil, fmt.Errorf("registering client concurrency callback: %w", err)
	}

	return c, nil
}
