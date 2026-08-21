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

// ErrBackendsUnavailable is returned while the pool sheds load fast because
// every backend is unhealthy and real traffic recently failed. Handlers
// surface it as 503 + Retry-After; restic retries that with backoff for up to
// 15 minutes, which beats queueing requests onto dead gateways where each one
// burns a dial timeout (docs/restic-retries.md).
var ErrBackendsUnavailable = errors.New("all S3 backends unavailable")

// Backend circuit-breaker states. A backend starts open (unproven) and is
// closed by its first probe; traffic failures reopen it, and a traffic-tripped
// backend must re-earn closed through half-open trial requests, since passing
// a probe proves much less than serving real load.
const (
	stateOpen     int32 = iota // ejected, receives no regular traffic
	stateClosed                // serving normally
	stateHalfOpen              // admits one trial request at a time
)

// halfOpenCloseAfter consecutive trial successes close a half-open backend.
const halfOpenCloseAfter = 3

// shedWindow is how long after a real-traffic failure the pool fails fast when
// nothing is serviceable. When it lapses, a single fail-open canary request is
// let through: its failure re-arms the window, its success starts reinstating
// the backend — so a dead cluster costs one probing request per window instead
// of a pile-up, and a false alarm heals itself.
const shedWindow = 30 * time.Second

// One-second buckets back a sliding error-rate view. It ejects brownout
// backends whose failures never run consecutively (each success resets the
// streak) yet whose probes pass: at least windowMinRequests in the window and
// windowFailurePercent of them failed.
const (
	windowBuckets        = 10
	windowMinRequests    = 20
	windowFailurePercent = 50
)

type windowBucket struct {
	sec                int64
	requests, failures int64
}

type window struct {
	mu      sync.Mutex
	buckets [windowBuckets]windowBucket
}

func (w *window) record(sec int64, failure bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	b := &w.buckets[sec%windowBuckets]
	if b.sec != sec {
		b.sec, b.requests, b.failures = sec, 0, 0
	}
	b.requests++
	if failure {
		b.failures++
	}
}

func (w *window) failureRateExceeded(sec int64) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	var requests, failures int64
	for _, b := range w.buckets {
		if b.sec > sec-windowBuckets {
			requests += b.requests
			failures += b.failures
		}
	}
	return requests >= windowMinRequests && failures*100 >= requests*windowFailurePercent
}

// recentSuccess reports whether any request succeeded inside the window — the
// signal that lets live traffic overrule a failing probe.
func (w *window) recentSuccess(sec int64) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, b := range w.buckets {
		if b.sec > sec-windowBuckets && b.requests > b.failures {
			return true
		}
	}
	return false
}

// Cross-backend retries are paid from a token budget refilled by successful
// traffic (by default one token per success, ten per retry, so at most ~1
// retry per 10 successes): a healthy pool masks isolated gateway failures,
// while a cluster-wide brownout cannot be amplified by retrying into it.
const (
	defaultRetryTokenEarn       = 1
	defaultRetryTokenCost       = 10
	defaultRetryBudgetCapFactor = 20 // cap defaults to this many retries' worth
)

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
	State           string // "closed" | "half_open" | "open"
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
	state    atomic.Int32
	trial    atomic.Int64 // the half-open state's single trial slot (0 free, 1 claimed)
	window   window
	// trafficTripped marks a backend that was ever ejected by real-traffic
	// failures: it must re-earn closed through half-open trials, while a
	// probe-only ejection (or a fresh backend) closes on a passing probe alone.
	trafficTripped    atomic.Bool
	halfOpenSuccesses atomic.Int64

	// cumulative, for metrics
	requests        atomic.Int64
	errors          atomic.Int64
	downloadedBytes atomic.Int64
	uploadedBytes   atomic.Int64
}

func stateName(s int32) string {
	switch s {
	case stateClosed:
		return "closed"
	case stateHalfOpen:
		return "half_open"
	default:
		return "open"
	}
}

// PoolConfig holds the tunables for a Pool. Zero values take the defaults.
type PoolConfig struct {
	EjectThreshold    int           // consecutive transport failures before ejection
	ProbeBucket       string        // sentinel bucket name for active health probes
	ReconcileInterval time.Duration // how often Run re-resolves and probes
	RetryTokenEarn    int           // budget tokens earned per successful request
	RetryTokenCost    int           // budget tokens one cross-backend retry spends
	RetryBudgetCap    int           // budget ceiling (bounds how many retries a burst can spend)
}

// Pool implements Storage by load-balancing requests across a set of
// interchangeable S3 gateway backends. Each backend runs a circuit breaker:
// consecutive or windowed traffic failures (and failed probes) open it,
// passing probes and successful trial traffic close it again. Idempotent
// operations that fail at the transport level are retried once on a different
// closed backend, within a budget; uploads are never retried (the body is the
// client's one-shot stream — restic re-drives those itself). With every
// backend open, the pool fails fast for a shed window after real-traffic
// failures rather than queueing requests onto dead gateways.
type Pool struct {
	backends    atomic.Pointer[[]*backend]
	factory     BackendFactory
	resolver    Resolver
	ejectThresh int64
	probeBucket string
	interval    time.Duration
	pickCounter atomic.Uint64
	logger      zerolog.Logger

	budget         atomic.Int64
	retryTokenEarn int64
	retryTokenCost int64
	retryBudgetCap int64
	retries        atomic.Int64
	retrySuccesses atomic.Int64
	retryDenied    atomic.Int64

	now             func() time.Time // injectable for deterministic tests
	lastFailureNano atomic.Int64
	canaryInflight  atomic.Int64
	sheds           atomic.Int64
	canaries        atomic.Int64
}

// PoolStat is a pool-wide snapshot of the retry and fast-fail machinery,
// consumed by the metrics layer.
type PoolStat struct {
	RetryAttempts  int64
	RetrySuccesses int64
	RetryDenied    int64
	RetryBudget    int64
	ShedRequests   int64
	CanaryRequests int64
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
	p.retryTokenEarn = int64(cfg.RetryTokenEarn)
	p.retryTokenCost = int64(cfg.RetryTokenCost)
	p.retryBudgetCap = int64(cfg.RetryBudgetCap)
	if p.retryTokenEarn < 1 {
		p.retryTokenEarn = defaultRetryTokenEarn
	}
	if p.retryTokenCost < 1 {
		p.retryTokenCost = defaultRetryTokenCost
	}
	if p.retryBudgetCap < 1 {
		p.retryBudgetCap = defaultRetryBudgetCapFactor * p.retryTokenCost
	}
	empty := []*backend{}
	p.backends.Store(&empty)
	p.budget.Store(p.retryBudgetCap)
	p.now = time.Now

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
			_ = p.Reconcile(ctx)
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
		b.state.Store(stateClosed)
		return
	}
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	if err := prober.Probe(ctx, p.probeBucket); err != nil {
		// Live traffic outranks probes: a backend serving real requests is not
		// ejected over a broken probe path (e.g. a misconfigured sentinel
		// bucket), or the two signals would flap it open and closed forever.
		if b.state.Load() == stateClosed && b.window.recentSuccess(p.now().Unix()) {
			p.logger.Warn().Str("backend", b.endpoint).Err(err).Msg("probe failed but traffic is healthy; keeping backend")
			return
		}
		if b.state.CompareAndSwap(stateClosed, stateOpen) {
			p.logger.Warn().Str("backend", b.endpoint).Err(err).Msg("backend failed health probe; ejecting")
		}
		if b.state.CompareAndSwap(stateHalfOpen, stateOpen) {
			b.halfOpenSuccesses.Store(0)
			p.logger.Warn().Str("backend", b.endpoint).Err(err).Msg("half-open backend failed health probe; reopening")
		}
		return
	}
	b.failures.Store(0)
	if b.trafficTripped.Load() {
		if b.state.CompareAndSwap(stateOpen, stateHalfOpen) {
			b.halfOpenSuccesses.Store(0)
			p.logger.Info().Str("backend", b.endpoint).Msg("probe passed; admitting trial traffic")
		}
		return
	}
	if b.state.CompareAndSwap(stateOpen, stateClosed) {
		p.logger.Info().Str("backend", b.endpoint).Msg("backend healthy; reinstated")
	}
}

// picked is one admitted request's routing decision. A canary holds the pool's
// single fail-open slot, a trial holds its backend's single half-open slot;
// both must be released when the operation completes.
type picked struct {
	b      *backend
	canary bool
	trial  bool
}

// pick selects the serving backend for a request. Closed backends compete by
// fewest outstanding requests, ties broken by a rotating offset; a half-open
// backend admits one trial request at a time via an atomically claimed slot,
// held until the operation (a streaming GET included) completes. With nothing
// serviceable, the pool fails fast inside the shed window and otherwise admits
// one fail-open canary to the least-loaded open backend.
func (p *Pool) pick() (picked, error) {
	bs := p.snapshot()
	n := len(bs)
	if n == 0 {
		return picked{}, ErrNoBackends
	}
	start := int(p.pickCounter.Add(1) % uint64(n))

	var best, trialCand *backend
	var bestLoad int64
	for i := range n {
		b := bs[(start+i)%n]
		switch b.state.Load() {
		case stateClosed:
			if load := b.inflight.Load(); best == nil || load < bestLoad {
				best, bestLoad = b, load
			}
		case stateHalfOpen:
			if trialCand == nil && b.trial.Load() == 0 {
				trialCand = b
			}
		}
	}
	// The trial goes first even when closed backends are idle: on a quiet
	// system trials are the only traffic a half-open backend ever sees, and
	// without them it could stay half-open indefinitely.
	if trialCand != nil && trialCand.trial.CompareAndSwap(0, 1) {
		return picked{b: trialCand, trial: true}, nil
	}
	if best != nil {
		return picked{b: best}, nil
	}

	if p.now().UnixNano()-p.lastFailureNano.Load() < int64(shedWindow) {
		p.sheds.Add(1)
		return picked{}, ErrBackendsUnavailable
	}
	// Canaries only probe fully-open backends: a half-open backend already has
	// its own trial gate, and admitting canaries there would let every new
	// request start an extra stream on it while a slow trial body is open.
	var fallback *backend
	var fallbackLoad int64
	for _, b := range bs {
		if b.state.Load() != stateOpen {
			continue
		}
		if load := b.inflight.Load(); fallback == nil || load < fallbackLoad {
			fallback, fallbackLoad = b, load
		}
	}
	if fallback == nil || !p.canaryInflight.CompareAndSwap(0, 1) {
		p.sheds.Add(1)
		return picked{}, ErrBackendsUnavailable
	}
	p.canaries.Add(1)
	p.logger.Warn().Str("backend", fallback.endpoint).Msg("no serviceable S3 backend; failing open with a canary request")
	return picked{b: fallback, canary: true}, nil
}

func (p *Pool) release(pk picked) {
	if pk.canary {
		p.canaryInflight.Store(0)
	}
	if pk.trial {
		pk.b.trial.Store(0)
	}
}

// pickHealthyOther returns the least-loaded closed backend other than exclude,
// or nil — a retry never fails open, it only moves to a backend believed good.
func (p *Pool) pickHealthyOther(exclude *backend) *backend {
	var best *backend
	var bestLoad int64
	for _, b := range p.snapshot() {
		if b == exclude || b.state.Load() != stateClosed {
			continue
		}
		if load := b.inflight.Load(); best == nil || load < bestLoad {
			best, bestLoad = b, load
		}
	}
	return best
}

func (p *Pool) earnRetryToken() {
	for {
		cur := p.budget.Load()
		if cur >= p.retryBudgetCap {
			return
		}
		if p.budget.CompareAndSwap(cur, min(cur+p.retryTokenEarn, p.retryBudgetCap)) {
			return
		}
	}
}

func (p *Pool) takeRetryTokens() bool {
	for {
		cur := p.budget.Load()
		if cur < p.retryTokenCost {
			return false
		}
		if p.budget.CompareAndSwap(cur, cur-p.retryTokenCost) {
			return true
		}
	}
}

// recordResult drives a backend's breaker from a completed operation's
// outcome. A transport failure trips closed→open on the consecutive-failure
// streak or the windowed error rate, and any failure reopens a half-open
// backend. A non-transport outcome (success, or a normal 4xx like a missing
// blob) proves liveness: it resets the streak, refills the retry budget,
// advances a half-open backend toward closed, and turns a successful fail-open
// canary on an open backend into a half-open one.
func (p *Pool) recordResult(b *backend, err error) {
	b.requests.Add(1)
	now := p.now()
	if isBackendFailure(err) {
		b.errors.Add(1)
		b.window.record(now.Unix(), true)
		p.lastFailureNano.Store(now.UnixNano())
		if b.state.CompareAndSwap(stateHalfOpen, stateOpen) {
			b.trafficTripped.Store(true)
			b.halfOpenSuccesses.Store(0)
			p.logger.Warn().Str("backend", b.endpoint).Msg("half-open S3 backend failed a trial; reopening")
			return
		}
		n := b.failures.Add(1)
		if (n >= p.ejectThresh || b.window.failureRateExceeded(now.Unix())) && b.state.CompareAndSwap(stateClosed, stateOpen) {
			b.trafficTripped.Store(true)
			p.logger.Warn().Str("backend", b.endpoint).Int64("failures", n).Msg("ejecting S3 backend after traffic failures")
		}
		return
	}
	b.failures.Store(0)
	b.window.record(now.Unix(), false)
	p.earnRetryToken()
	switch b.state.Load() {
	case stateHalfOpen:
		if b.halfOpenSuccesses.Add(1) >= halfOpenCloseAfter && b.state.CompareAndSwap(stateHalfOpen, stateClosed) {
			p.logger.Info().Str("backend", b.endpoint).Msg("backend passed its trials; closing")
		}
	case stateOpen:
		// The completed canary counts as the first trial. A GET canary takes the
		// other path — noteCanaryLiveness at headers seeds the streak at zero and
		// this switch sees stateHalfOpen when the body closes — so either way one
		// canary request contributes exactly one success.
		if p.noteCanaryLiveness(b) {
			b.halfOpenSuccesses.Add(1)
		}
	}
}

// noteCanaryLiveness turns a response from an open backend (a fail-open
// canary) into half-open: the gateway answered, so trial traffic may resume.
// It reports whether this call made the transition.
func (p *Pool) noteCanaryLiveness(b *backend) bool {
	if b.state.CompareAndSwap(stateOpen, stateHalfOpen) {
		b.halfOpenSuccesses.Store(0)
		p.logger.Info().Str("backend", b.endpoint).Msg("open backend served a canary; admitting trial traffic")
		return true
	}
	return false
}

func (p *Pool) runOn(b *backend, fn func(s Storage) error) error {
	b.inflight.Add(1)
	err := fn(b.store)
	b.inflight.Add(-1)
	p.recordResult(b, err)
	return err
}

func canAlwaysRetry() bool { return true }

// do runs an in-call operation (one that completes before returning) on a
// picked backend. On a transport-level failure, if canRetry allows it (nil
// means never — the operation is not idempotent), the pool retries once on a
// different healthy backend: restic would otherwise see a 500 for a blip a
// sibling gateway would have absorbed, and its per-file Load breaker then
// locks the affected blob out client-side for an hour (docs/restic-retries.md).
func (p *Pool) do(ctx context.Context, canRetry func() bool, fn func(s Storage) error) error {
	pk, perr := p.pick()
	if perr != nil {
		return perr
	}
	err := p.runOn(pk.b, fn)
	p.release(pk)
	if !isBackendFailure(err) || canRetry == nil || !canRetry() || ctx.Err() != nil {
		return err
	}
	next := p.pickHealthyOther(pk.b)
	if next == nil {
		return err
	}
	if !p.takeRetryTokens() {
		p.retryDenied.Add(1)
		return err
	}
	p.retries.Add(1)
	rerr := p.runOn(next, fn)
	if !isBackendFailure(rerr) {
		p.retrySuccesses.Add(1)
	}
	return rerr
}

// Stats returns a per-backend snapshot for the metrics layer.
func (p *Pool) Stats() []BackendStat {
	bs := p.snapshot()
	stats := make([]BackendStat, 0, len(bs))
	for _, b := range bs {
		state := b.state.Load()
		stats = append(stats, BackendStat{
			Endpoint:        b.endpoint,
			Healthy:         state == stateClosed,
			State:           stateName(state),
			Inflight:        b.inflight.Load(),
			Requests:        b.requests.Load(),
			Errors:          b.errors.Load(),
			DownloadedBytes: b.downloadedBytes.Load(),
			UploadedBytes:   b.uploadedBytes.Load(),
		})
	}
	return stats
}

// PoolStats returns the pool-wide retry snapshot for the metrics layer.
func (p *Pool) PoolStats() PoolStat {
	return PoolStat{
		RetryAttempts:  p.retries.Load(),
		RetrySuccesses: p.retrySuccesses.Load(),
		RetryDenied:    p.retryDenied.Load(),
		RetryBudget:    p.budget.Load(),
		ShedRequests:   p.sheds.Load(),
		CanaryRequests: p.canaries.Load(),
	}
}

// --- Storage interface ---

func (p *Pool) CheckBucket(ctx context.Context, bucket string) (bool, error) {
	var exists bool
	err := p.do(ctx, canAlwaysRetry, func(s Storage) error {
		var e error
		exists, e = s.CheckBucket(ctx, bucket)
		return e
	})
	return exists, err
}

func (p *Pool) CreateBucket(ctx context.Context, bucket string) error {
	// Never retried: an ambiguous first attempt may have created the bucket,
	// and a second create then fails differently instead of surfacing the
	// original error.
	return p.do(ctx, nil, func(s Storage) error {
		return s.CreateBucket(ctx, bucket)
	})
}

func (p *Pool) HeadObject(ctx context.Context, bucket, key string) (int64, error) {
	var size int64
	err := p.do(ctx, canAlwaysRetry, func(s Storage) error {
		var e error
		size, e = s.HeadObject(ctx, bucket, key)
		return e
	})
	return size, err
}

// ListObjects retries only while nothing has been emitted: entries already
// streamed to the caller cannot be taken back, and a fresh listing on another
// backend would duplicate them.
func (p *Pool) ListObjects(ctx context.Context, bucket, prefix string, fn func(BlobInfo) error) error {
	var emitted atomic.Bool
	return p.do(ctx, func() bool { return !emitted.Load() }, func(s Storage) error {
		return s.ListObjects(ctx, bucket, prefix, func(b BlobInfo) error {
			emitted.Store(true)
			return fn(b)
		})
	})
}

func (p *Pool) DeleteObject(ctx context.Context, bucket, key string) error {
	return p.do(ctx, canAlwaysRetry, func(s Storage) error {
		return s.DeleteObject(ctx, bucket, key)
	})
}

// PutObject is never retried: the body is the client's stream and can only be
// consumed once — restic re-drives failed uploads itself with a rewindable
// pack (docs/restic-retries.md).
func (p *Pool) PutObject(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error {
	pk, perr := p.pick()
	if perr != nil {
		return perr
	}
	b := pk.b
	// The body is fully consumed and uploaded before PutObject returns, so the
	// upload — the large transfer — is accounted end-to-end here.
	b.inflight.Add(1)
	err := b.store.PutObject(ctx, bucket, key, body, contentLength, writeOnce, sha256Hex)
	b.inflight.Add(-1)
	if err == nil && contentLength > 0 {
		b.uploadedBytes.Add(contentLength)
	}
	p.recordResult(b, err)
	p.release(pk)
	return err
}

// GetObject retries header-phase failures on a different healthy backend; once
// headers are returned the body is streamed by the caller and a mid-stream
// failure cannot be replayed.
func (p *Pool) GetObject(ctx context.Context, bucket, key, rangeHeader string) (*S3Object, error) {
	pk, perr := p.pick()
	if perr != nil {
		return nil, perr
	}
	obj, err := p.getFrom(ctx, pk, bucket, key, rangeHeader)
	if !isBackendFailure(err) || ctx.Err() != nil {
		return obj, err
	}
	next := p.pickHealthyOther(pk.b)
	if next == nil {
		return nil, err
	}
	if !p.takeRetryTokens() {
		p.retryDenied.Add(1)
		return nil, err
	}
	p.retries.Add(1)
	obj, rerr := p.getFrom(ctx, picked{b: next}, bucket, key, rangeHeader)
	if !isBackendFailure(rerr) {
		p.retrySuccesses.Add(1)
	}
	return obj, rerr
}

func (p *Pool) getFrom(ctx context.Context, pk picked, bucket, key, rangeHeader string) (*S3Object, error) {
	// The SDK returns headers here but the body is streamed by the caller after
	// we return, so inflight (and a canary's fail-open slot) must stay held
	// until the body is closed.
	b := pk.b
	b.inflight.Add(1)
	obj, err := b.store.GetObject(ctx, bucket, key, rangeHeader)
	if err != nil {
		b.inflight.Add(-1)
		p.recordResult(b, err)
		p.release(pk)
		return nil, err
	}
	if pk.canary {
		// Headers back is liveness proven: free the pool-wide canary slot now
		// rather than holding recovery hostage to an arbitrarily slow body
		// stream. The body's outcome still reaches recordResult on Close.
		p.noteCanaryLiveness(b)
		p.release(pk)
		pk = picked{b: b}
	}
	obj.Body = &poolBody{ReadCloser: obj.Body, pool: p, picked: pk}
	return obj, nil
}

// poolBody wraps a GetObject body so that closing it releases the inflight
// slot (and a canary's fail-open slot), records downloaded bytes, and reports
// any mid-stream read failure toward the backend's health (a read error from a
// dead gateway has no HTTP status and so counts as a transport failure).
type poolBody struct {
	io.ReadCloser
	pool    *Pool
	picked  picked
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
		b.picked.b.inflight.Add(-1)
		b.picked.b.downloadedBytes.Add(b.n)
		b.pool.recordResult(b.picked.b, b.readErr)
		b.pool.release(b.picked)
	}
	return err
}
