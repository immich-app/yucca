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

// clientIdleTTL bounds how long a client with nothing outstanding is kept in
// the concurrency tracker. It only has to outlive the gap between collection
// cycles — a client that comes back before eviction simply reuses its entry.
const clientIdleTTL = 15 * time.Minute

type clientAttrKey struct{ user, repository, connection string }

// clientAttrs labels a measurement with the request's identity and nothing
// else — no method, route or status. That is what keeps the per-client
// instruments at a fixed handful of series per client-repository however
// restic exercises the API, unlike the request counters which multiply by
// route and status.
func clientAttrs(key clientAttrKey) otelmetric.MeasurementOption {
	return otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("customerId", key.user),
		attribute.String("repositoryId", key.repository),
		attribute.String("connection", key.connection),
	))
}

// clientConcurrency is one client's outstanding-request accounting: cur is the
// live count, peak the high-water mark since the last collection.
//
// The label set is built once and held here rather than in a cache of its own,
// so it is reclaimed with the client on idle eviction. A separate cache keyed
// by identity would instead grow with every client-repository pair the process
// has ever seen.
type clientConcurrency struct {
	attrs    otelmetric.MeasurementOption
	cur      atomic.Int64
	peak     atomic.Int64
	lastSeen atomic.Int64 // unix nanos, stamped when a request finishes
}

// enter accounts for a request starting, raising the high-water mark if this
// request is the most concurrent one yet in the current window.
func (c *clientConcurrency) enter() {
	cur := c.cur.Add(1)
	for {
		peak := c.peak.Load()
		if cur <= peak || c.peak.CompareAndSwap(peak, cur) {
			return
		}
	}
}

func (c *clientConcurrency) exit(now time.Time) {
	c.cur.Add(-1)
	c.lastSeen.Store(now.UnixNano())
}

type clientTracker struct {
	states sync.Map // clientAttrKey -> *clientConcurrency
}

// enter loads before storing so the hot path is a single map read; the label
// set is only built when a client is seen for the first time.
func (t *clientTracker) enter(key clientAttrKey) *clientConcurrency {
	v, ok := t.states.Load(key)
	if !ok {
		v, _ = t.states.LoadOrStore(key, &clientConcurrency{attrs: clientAttrs(key)})
	}
	state := v.(*clientConcurrency)
	state.enter()
	return state
}

// observe reports each client's high-water concurrency and arms the next
// window. The peak resets to the CURRENT outstanding count rather than zero:
// restic holds its connections open for a whole backup, so a client sitting at
// N concurrent requests across several collection cycles would otherwise
// report N once and 0 forever after.
func (t *clientTracker) observe(o otelmetric.Observer, gauge otelmetric.Int64ObservableGauge, now time.Time) {
	t.states.Range(func(k, v any) bool {
		key := k.(clientAttrKey)
		state := v.(*clientConcurrency)

		cur := state.cur.Load()
		peak := state.peak.Swap(cur)

		if cur == 0 && peak == 0 && now.UnixNano()-state.lastSeen.Load() > int64(clientIdleTTL) {
			t.states.Delete(key)
			return true
		}

		o.ObserveInt64(gauge, peak, state.attrs)
		return true
	})
}

// clientMetrics measures how each client drives the gateway, as opposed to how
// the gateway performs per route.
//
// Parallelism comes from `seconds` by Little's Law: the rate of accumulated
// request-seconds over a window IS the mean number of requests in flight, so
// `rate(client.request.seconds)` reads directly as average concurrency without
// any per-client state. Dividing it by the matching request rate from
// `http.server.request.count` gives mean duration.
//
// `peak` covers what an average cannot — a client that saturates its
// connection budget in bursts. Note it is per michael replica: a client whose
// connections spread across replicas makes a summed peak an upper bound,
// whereas the Little's Law average sums exactly.
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

	// Duration runs until the client has drained the body, so on large blobs it
	// measures the client's link; TTFB isolates michael+RGW. Split per client so
	// a slow customer is distinguishable from a slow backend.
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
