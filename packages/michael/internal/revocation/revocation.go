// Package revocation decides whether a restic token jti may currently be used.
//
// The source of truth is postgres (resticTokens), fronted by yucca-api's
// internal introspection endpoint. michael layers two caches over it:
//
//	L1: per-process two-horizon cache — a confirmed verdict is served without
//	    any lookup for the *fresh* TTL, and a previously-valid jti is honored
//	    for the longer *grace* TTL when every backend is unreachable
//	    (bounded grace, then deny).
//	L2: optional shared Redis verdict cache (yucca:michael:verdict:<jti>,
//	    short TTL) — read-through on L1 miss, written back after
//	    introspection. The APIs best-effort DEL the key on revoke, so a
//	    revocation propagates to every replica within ~the L1 fresh TTL; a
//	    missed DEL self-heals when the entry's TTL lapses. Redis is pure
//	    cache: any miss or error falls through to introspection.
//
// A jti never confirmed valid (revoked, unknown, or first seen during an
// outage) is denied immediately — absence of proof is denial, never approval.
package revocation

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// Decision is the outcome of a validity check. The zero value is deliberately
// DecisionInvalid (deny): any future code path that leaks a zero Decision fails
// closed, never open.
type Decision int

const (
	// DecisionInvalid — confirmed not active: revoked, expired, or never issued.
	DecisionInvalid Decision = iota
	// DecisionValid — confirmed active (L1 fresh, L2, or introspection).
	DecisionValid
	// DecisionGrace — backends unreachable, but a previously-valid jti is still
	// inside its grace window. Allowed, degraded.
	DecisionGrace
	// DecisionUnavailable — backends unreachable and no valid grace entry
	// exists. Denied (fail closed, bounded).
	DecisionUnavailable
)

// Validator decides whether a restic token jti may currently be used.
type Validator interface {
	Check(ctx context.Context, jti string) (Decision, error)
}

// Introspector answers the authoritative question: is this jti active?
type Introspector interface {
	Active(ctx context.Context, jti string) (bool, error)
}

const cacheSize = 8192

// HTTPIntrospector calls yucca-api's internal introspection endpoint
// (GET {base}/{jti} with a shared-secret header).
type HTTPIntrospector struct {
	base   string
	secret string
	client *http.Client
}

func NewHTTPIntrospector(base, secret string, timeout time.Duration) *HTTPIntrospector {
	return &HTTPIntrospector{
		base:   strings.TrimRight(base, "/"),
		secret: secret,
		client: &http.Client{Timeout: timeout},
	}
}

func (h *HTTPIntrospector) Active(ctx context.Context, jti string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.base+"/"+url.PathEscape(jti), nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("X-Introspection-Secret", h.secret)

	resp, err := h.client.Do(req)
	if err != nil {
		return false, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		// Auth/config errors and 5xx alike: no verdict — the caller degrades to
		// grace semantics rather than treating this as revoked.
		return false, fmt.Errorf("introspection returned status %d", resp.StatusCode)
	}

	var body struct {
		Active bool `json:"active"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&body); err != nil {
		return false, fmt.Errorf("introspection response: %w", err)
	}
	return body.Active, nil
}

func verdictKey(jti string) string {
	return "yucca:michael:verdict:" + jti
}

// RedisVerdictCache is the optional shared L2: cached verdicts with a short
// TTL, DELed by the APIs on revoke. Strictly a cache — errors and misses both
// mean "ask the source".
type RedisVerdictCache struct {
	client  *redis.Client
	timeout time.Duration
	ttl     time.Duration
}

func NewRedisVerdictCache(addr string, timeout, ttl time.Duration) *RedisVerdictCache {
	return &RedisVerdictCache{
		client: redis.NewClient(&redis.Options{
			Addr:         addr,
			DialTimeout:  timeout,
			ReadTimeout:  timeout,
			WriteTimeout: timeout,
			MaxRetries:   1,
		}),
		timeout: timeout,
		ttl:     ttl,
	}
}

// get returns (active, found, age, error) where age is how long ago the entry
// was written (derived from its remaining TTL) — the time since the last
// AUTHORITATIVE confirmation, which the caller uses to anchor its grace
// horizon. redis.Nil is a miss, not an error.
func (c *RedisVerdictCache) get(ctx context.Context, jti string) (bool, bool, time.Duration, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	pipe := c.client.Pipeline()
	getCmd := pipe.Get(ctx, verdictKey(jti))
	ttlCmd := pipe.PTTL(ctx, verdictKey(jti))
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return false, false, 0, err
	}

	v, err := getCmd.Result()
	if err == redis.Nil {
		return false, false, 0, nil
	}
	if err != nil {
		return false, false, 0, err
	}

	age := time.Duration(0)
	if remaining, err := ttlCmd.Result(); err == nil && remaining > 0 && remaining < c.ttl {
		age = c.ttl - remaining
	}
	return v == "1", true, age, nil
}

// set is best-effort: a failed write only costs a future cache miss.
func (c *RedisVerdictCache) set(ctx context.Context, jti string, active bool) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	v := "0"
	if active {
		v = "1"
	}
	_ = c.client.Set(ctx, verdictKey(jti), v, c.ttl).Err()
}

func (c *RedisVerdictCache) Close() error {
	return c.client.Close()
}

// defaultSourceBackoff is how long the validator waits after a failed
// introspection call before dialing the source again. Requests inside the
// window resolve straight from grace semantics instead of stacking up behind
// the introspection timeout — an outage must not turn restic's request
// concurrency into a control-plane storm.
const defaultSourceBackoff = 5 * time.Second

// LayeredValidator is L1 → L2 → introspection with bounded-grace-then-deny.
type LayeredValidator struct {
	source        Introspector
	l2            *RedisVerdictCache // nil = disabled
	freshTTL      time.Duration
	graceTTL      time.Duration
	cache         *resultCache
	sourceBackoff time.Duration
	// Unix nanos of the last source failure (0 = healthy); shared across
	// requests so one failed dial silences the rest of the backoff window.
	lastSourceFailure atomic.Int64
}

// NewLayeredValidator builds the validator. l2 may be nil (no shared cache).
// freshTTL is how long a confirmed verdict is served without any lookup;
// graceTTL (≥ freshTTL) is how long a previously-valid jti keeps being honored
// while both L2 and the introspection source are unreachable.
func NewLayeredValidator(source Introspector, l2 *RedisVerdictCache, freshTTL, graceTTL time.Duration) *LayeredValidator {
	return &LayeredValidator{
		source:        source,
		l2:            l2,
		freshTTL:      freshTTL,
		graceTTL:      graceTTL,
		cache:         newResultCache(cacheSize),
		sourceBackoff: defaultSourceBackoff,
	}
}

func (v *LayeredValidator) Check(ctx context.Context, jti string) (Decision, error) {
	now := time.Now()
	if active, ok := v.cache.getFresh(jti, now); ok {
		return toDecision(active), nil
	}

	// L2: a hit is authoritative-enough (short TTL, revoke-DELed). Errors and
	// misses both fall through to the source. The grace horizon is anchored to
	// when the entry was WRITTEN (its authoritative confirmation), not to this
	// cache read — so REVOCATION_GRACE_MS is a true end-to-end bound.
	if v.l2 != nil {
		if active, found, age, err := v.l2.get(ctx, jti); err == nil && found {
			v.cache.put(jti, active, now.Add(v.freshTTL), now.Add(v.graceTTL-age))
			return toDecision(active), nil
		}
	}

	// Inside the post-failure backoff window, don't dial a source we just saw
	// fail — resolve from grace semantics immediately.
	if last := v.lastSourceFailure.Load(); last != 0 && now.Sub(time.Unix(0, last)) < v.sourceBackoff {
		if v.cache.graceValid(jti, now) {
			return DecisionGrace, fmt.Errorf("introspection in failure backoff")
		}
		return DecisionUnavailable, fmt.Errorf("introspection in failure backoff")
	}

	active, err := v.source.Active(ctx, jti)
	if err != nil {
		// Source unreachable: honor a previously-valid jti within grace, else
		// deny. The verdict is NOT cached, but the failure gates further dials
		// for the backoff window.
		v.lastSourceFailure.Store(now.UnixNano())
		if v.cache.graceValid(jti, now) {
			return DecisionGrace, err
		}
		return DecisionUnavailable, err
	}
	v.lastSourceFailure.Store(0)

	v.cache.put(jti, active, now.Add(v.freshTTL), now.Add(v.graceTTL))
	if v.l2 != nil {
		v.l2.set(ctx, jti, active)
	}
	return toDecision(active), nil
}

func (v *LayeredValidator) Close() error {
	if v.l2 != nil {
		return v.l2.Close()
	}
	return nil
}

func toDecision(active bool) Decision {
	if active {
		return DecisionValid
	}
	return DecisionInvalid
}

// resultCache is a bounded LRU of jti → validity with two per-entry horizons
// (mirrors internal/auth's tokenCache).
type resultCache struct {
	mu      sync.Mutex
	max     int
	order   *list.List
	entries map[string]*list.Element
}

type cacheEntry struct {
	jti      string
	valid    bool
	freshExp time.Time
	graceExp time.Time
}

func newResultCache(max int) *resultCache {
	return &resultCache{
		max:     max,
		order:   list.New(),
		entries: make(map[string]*list.Element, max),
	}
}

// getFresh returns the cached validity if the entry is still within its fresh
// horizon. A fully-expired entry (past grace) is evicted.
func (c *resultCache) getFresh(jti string, now time.Time) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.entries[jti]
	if !ok {
		return false, false
	}
	entry := e.Value.(*cacheEntry)
	if !now.Before(entry.graceExp) {
		c.order.Remove(e)
		delete(c.entries, jti)
		return false, false
	}
	if !now.Before(entry.freshExp) {
		// Past fresh but within grace: not a fresh hit, keep the entry for grace.
		return false, false
	}
	c.order.MoveToFront(e)
	return entry.valid, true
}

// graceValid reports whether a previously-valid entry is still within grace —
// the only case where unreachable backends are allowed to pass a request.
func (c *resultCache) graceValid(jti string, now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.entries[jti]
	if !ok {
		return false
	}
	entry := e.Value.(*cacheEntry)
	if !entry.valid || !now.Before(entry.graceExp) {
		return false
	}
	c.order.MoveToFront(e)
	return true
}

func (c *resultCache) put(jti string, valid bool, freshExp, graceExp time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if e, ok := c.entries[jti]; ok {
		entry := e.Value.(*cacheEntry)
		entry.valid = valid
		entry.freshExp = freshExp
		entry.graceExp = graceExp
		c.order.MoveToFront(e)
		return
	}
	if c.order.Len() >= c.max {
		oldest := c.order.Back()
		if oldest != nil {
			c.order.Remove(oldest)
			delete(c.entries, oldest.Value.(*cacheEntry).jti)
		}
	}
	c.entries[jti] = c.order.PushFront(&cacheEntry{jti: jti, valid: valid, freshExp: freshExp, graceExp: graceExp})
}
