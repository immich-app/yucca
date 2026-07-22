package storage

import (
	"context"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
)

// probeTimeout bounds a single health probe. Without it a probe against an
// unreachable (blackholed, not refused) backend runs to the 30s dial timeout.
const probeTimeout = 5 * time.Second

// ErrNoBackends is returned when the pool has no backend to route a request to.
var ErrNoBackends = errors.New("no S3 backends available")

// Prober is implemented by backends that support an active liveness probe.
// *S3Storage satisfies it; the reconciler skips probing for stores that don't.
type Prober interface {
	Probe(ctx context.Context, bucket string) error
}

// BackendFactory builds a Storage bound to a single endpoint. The production
// factory wraps NewS3StorageForEndpoint; tests inject in-memory fakes.
type BackendFactory func(endpoint string) (Storage, error)

// BackendStat is a point-in-time snapshot of one backend, consumed by the
// metrics layer to emit per-backend series.
type BackendStat struct {
	Endpoint        string
	Healthy         bool
	Inflight        int64
	Requests        int64
	Errors          int64
	DownloadedBytes int64
	UploadedBytes   int64
}

// backend holds one endpoint's client plus lock-free counters. A *backend is
// stable for its lifetime — reconcile swaps the Pool's slice but reuses the
// same *backend for endpoints that persist, so its atomics survive.
type backend struct {
	endpoint string
	store    Storage

	inflight atomic.Int64 // outstanding requests (drives least-outstanding pick)
	failures atomic.Int64 // consecutive transport failures (passive ejection)
	healthy  atomic.Bool

	// cumulative, for metrics
	requests        atomic.Int64
	errors          atomic.Int64
	downloadedBytes atomic.Int64
	uploadedBytes   atomic.Int64
}

// PoolConfig holds the tunables for a Pool.
type PoolConfig struct {
	EjectThreshold    int           // consecutive transport failures before ejection
	ProbeBucket       string        // sentinel bucket name for active health probes
	ReconcileInterval time.Duration // how often Run re-resolves and probes
}

// Pool implements Storage by load-balancing requests across a set of
// interchangeable S3 gateway backends. It picks the backend with the fewest
// outstanding requests, ejects backends after consecutive transport failures,
// and actively probes to reinstate them. The pool never retries a failed
// request — it records the failure and returns it, leaving retries to the
// client (restic).
type Pool struct {
	backends    atomic.Pointer[[]*backend]
	factory     BackendFactory
	resolver    Resolver
	ejectThresh int64
	probeBucket string
	interval    time.Duration
	pickCounter atomic.Uint64
	logger      zerolog.Logger
}

var _ Storage = (*Pool)(nil)

// NewPool resolves the initial backend set, probes it, and returns a ready
// pool. It errors if the source can't be resolved or yields no backends.
func NewPool(cfg PoolConfig, factory BackendFactory, resolver Resolver, logger zerolog.Logger) (*Pool, error) {
	p := &Pool{
		factory:     factory,
		resolver:    resolver,
		ejectThresh: int64(cfg.EjectThreshold),
		probeBucket: cfg.ProbeBucket,
		interval:    cfg.ReconcileInterval,
		logger:      logger,
	}
	if p.ejectThresh < 1 {
		p.ejectThresh = 1
	}
	if p.interval <= 0 {
		p.interval = 5 * time.Second
	}
	empty := []*backend{}
	p.backends.Store(&empty)

	if err := p.Reconcile(context.Background()); err != nil {
		return nil, err
	}
	if len(p.snapshot()) == 0 {
		return nil, errors.New("no S3 backends resolved at startup")
	}
	return p, nil
}

func (p *Pool) snapshot() []*backend { return *p.backends.Load() }

// Run drives Reconcile on a ticker until ctx is cancelled.
func (p *Pool) Run(ctx context.Context) {
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.Reconcile(ctx)
		}
	}
}

// Reconcile re-resolves the backend set and probes every backend. Exported so
// tests can drive it deterministically without timers.
func (p *Pool) Reconcile(ctx context.Context) error {
	endpoints, err := p.resolver.Resolve(ctx)
	switch {
	case err != nil:
		// Keep the current set on a transient resolver error rather than wiping
		// it — a DNS blip shouldn't drain the pool.
		p.logger.Error().Err(err).Str("source", p.resolver.Describe()).Msg("backend resolution failed; keeping current set")
	case len(endpoints) == 0:
		// Likewise, don't scale to zero on an empty result.
		p.logger.Warn().Str("source", p.resolver.Describe()).Msg("backend source returned no endpoints; keeping current set")
	default:
		p.applyEndpoints(endpoints)
	}
	p.probeAll(ctx)
	return err
}

// applyEndpoints diffs the desired endpoint set against the current backends,
// reusing existing *backend objects (preserving their health/counters) and
// constructing new ones for added endpoints. New backends start unhealthy; the
// probe in this same reconcile promotes the live ones.
func (p *Pool) applyEndpoints(endpoints []string) {
	current := p.snapshot()
	byEndpoint := make(map[string]*backend, len(current))
	for _, b := range current {
		byEndpoint[b.endpoint] = b
	}

	desired := make(map[string]struct{}, len(endpoints))
	next := make([]*backend, 0, len(endpoints))
	added := 0
	for _, ep := range endpoints {
		desired[ep] = struct{}{}
		if b, ok := byEndpoint[ep]; ok {
			next = append(next, b)
			continue
		}
		store, ferr := p.factory(ep)
		if ferr != nil {
			p.logger.Error().Err(ferr).Str("backend", ep).Msg("failed to build backend; skipping")
			continue
		}
		b := &backend{endpoint: ep, store: store}
		b.healthy.Store(false)
		next = append(next, b)
		added++
	}

	removed := 0
	for ep := range byEndpoint {
		if _, ok := desired[ep]; !ok {
			removed++
		}
	}
	if added > 0 || removed > 0 {
		p.logger.Info().Int("added", added).Int("removed", removed).Int("total", len(next)).Msg("S3 backend set changed")
	}
	p.backends.Store(&next)
}

// probeAll actively checks every backend, ejecting those that fail the probe
// and reinstating (clearing the passive failure streak of) those that pass.
// Probes run concurrently with a per-probe timeout, so a reconcile costs
// max(probe) rather than sum — N unreachable backends once serialized N×30s
// dial timeouts into pool init and crash-looped startup.
func (p *Pool) probeAll(ctx context.Context) {
	var wg sync.WaitGroup
	for _, b := range p.snapshot() {
		wg.Add(1)
		go func(b *backend) {
			defer wg.Done()
			p.probeOne(ctx, b)
		}(b)
	}
	wg.Wait()
}

func (p *Pool) probeOne(ctx context.Context, b *backend) {
	prober, ok := b.store.(Prober)
	if !ok {
		// Unprobeable store (e.g. a bare fake): assume healthy.
		b.healthy.Store(true)
		return
	}
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	if err := prober.Probe(ctx, p.probeBucket); err != nil {
		if b.healthy.CompareAndSwap(true, false) {
			p.logger.Warn().Str("backend", b.endpoint).Err(err).Msg("backend failed health probe; ejecting")
		}
		return
	}
	b.failures.Store(0)
	if b.healthy.CompareAndSwap(false, true) {
		p.logger.Info().Str("backend", b.endpoint).Msg("backend healthy; reinstated")
	}
}

// pick selects the healthy backend with the fewest outstanding requests. Ties
// are broken by a rotating offset so equal-load backends are used round-robin.
// If nothing is healthy it fails open to the least-loaded backend overall,
// degrading rather than refusing service.
func (p *Pool) pick() *backend {
	bs := p.snapshot()
	n := len(bs)
	if n == 0 {
		return nil
	}
	start := int(p.pickCounter.Add(1) % uint64(n))

	var best, fallback *backend
	var bestLoad, fallbackLoad int64
	for i := range n {
		b := bs[(start+i)%n]
		load := b.inflight.Load()
		if fallback == nil || load < fallbackLoad {
			fallback, fallbackLoad = b, load
		}
		if !b.healthy.Load() {
			continue
		}
		if best == nil || load < bestLoad {
			best, bestLoad = b, load
		}
	}
	if best != nil {
		return best
	}
	p.logger.Warn().Msg("no healthy S3 backends; failing open to least-loaded")
	return fallback
}

// recordResult updates a backend's counters and passive-ejection state after a
// completed operation. A transport failure increments the consecutive-failure
// streak and ejects once it crosses the threshold; any non-transport outcome
// (success, or a normal 4xx like a missing blob) proves liveness and resets it.
func (p *Pool) recordResult(b *backend, err error) {
	b.requests.Add(1)
	if isBackendFailure(err) {
		b.errors.Add(1)
		n := b.failures.Add(1)
		if n >= p.ejectThresh && b.healthy.CompareAndSwap(true, false) {
			p.logger.Warn().Str("backend", b.endpoint).Int64("failures", n).Msg("ejecting S3 backend after consecutive failures")
		}
		return
	}
	b.failures.Store(0)
}

// do runs an in-call operation (one that completes before returning) on a
// picked backend, accounting inflight and recording the result.
func (p *Pool) do(fn func(s Storage) error) error {
	b := p.pick()
	if b == nil {
		return ErrNoBackends
	}
	b.inflight.Add(1)
	err := fn(b.store)
	b.inflight.Add(-1)
	p.recordResult(b, err)
	return err
}

// Stats returns a per-backend snapshot for the metrics layer.
func (p *Pool) Stats() []BackendStat {
	bs := p.snapshot()
	stats := make([]BackendStat, 0, len(bs))
	for _, b := range bs {
		stats = append(stats, BackendStat{
			Endpoint:        b.endpoint,
			Healthy:         b.healthy.Load(),
			Inflight:        b.inflight.Load(),
			Requests:        b.requests.Load(),
			Errors:          b.errors.Load(),
			DownloadedBytes: b.downloadedBytes.Load(),
			UploadedBytes:   b.uploadedBytes.Load(),
		})
	}
	return stats
}

// --- Storage interface ---

func (p *Pool) CheckBucket(ctx context.Context, bucket string) (bool, error) {
	var exists bool
	err := p.do(func(s Storage) error {
		var e error
		exists, e = s.CheckBucket(ctx, bucket)
		return e
	})
	return exists, err
}

func (p *Pool) CreateBucket(ctx context.Context, bucket string) error {
	return p.do(func(s Storage) error {
		return s.CreateBucket(ctx, bucket)
	})
}

func (p *Pool) HeadObject(ctx context.Context, bucket, key string) (int64, error) {
	var size int64
	err := p.do(func(s Storage) error {
		var e error
		size, e = s.HeadObject(ctx, bucket, key)
		return e
	})
	return size, err
}

func (p *Pool) ListObjects(ctx context.Context, bucket, prefix string) ([]BlobInfo, error) {
	var blobs []BlobInfo
	err := p.do(func(s Storage) error {
		var e error
		blobs, e = s.ListObjects(ctx, bucket, prefix)
		return e
	})
	return blobs, err
}

func (p *Pool) DeleteObject(ctx context.Context, bucket, key string) error {
	return p.do(func(s Storage) error {
		return s.DeleteObject(ctx, bucket, key)
	})
}

func (p *Pool) PutObject(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error {
	b := p.pick()
	if b == nil {
		return ErrNoBackends
	}
	// The body is fully consumed and uploaded before PutObject returns, so the
	// upload — the large transfer — is accounted end-to-end here.
	b.inflight.Add(1)
	err := b.store.PutObject(ctx, bucket, key, body, contentLength, writeOnce, sha256Hex)
	b.inflight.Add(-1)
	if err == nil && contentLength > 0 {
		b.uploadedBytes.Add(contentLength)
	}
	p.recordResult(b, err)
	return err
}

func (p *Pool) GetObject(ctx context.Context, bucket, key, rangeHeader string) (*S3Object, error) {
	b := p.pick()
	if b == nil {
		return nil, ErrNoBackends
	}
	// The SDK returns headers here but the body is streamed by the caller after
	// we return, so inflight must stay counted until the body is closed.
	b.inflight.Add(1)
	obj, err := b.store.GetObject(ctx, bucket, key, rangeHeader)
	if err != nil {
		b.inflight.Add(-1)
		p.recordResult(b, err)
		return nil, err
	}
	obj.Body = &poolBody{ReadCloser: obj.Body, pool: p, backend: b}
	return obj, nil
}

// poolBody wraps a GetObject body so that closing it releases the inflight slot,
// records downloaded bytes, and reports any mid-stream read failure toward the
// backend's health (a read error from a dead gateway has no HTTP status and so
// counts as a transport failure).
type poolBody struct {
	io.ReadCloser
	pool    *Pool
	backend *backend
	n       int64
	readErr error
	done    atomic.Bool
}

func (b *poolBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.n += int64(n)
	if err != nil && err != io.EOF {
		b.readErr = err
	}
	return n, err
}

func (b *poolBody) Close() error {
	err := b.ReadCloser.Close()
	if b.done.CompareAndSwap(false, true) {
		b.backend.inflight.Add(-1)
		b.backend.downloadedBytes.Add(b.n)
		b.pool.recordResult(b.backend, b.readErr)
	}
	return err
}
