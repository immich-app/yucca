// Package revocation front-runs a positive Redis "validity" marker
// (yucca:restic:valid:<jti>) written on mint and cleared on revoke. michael
// treats a present marker as valid and an absent marker as invalid (revoked or
// never-issued) — the inverse of a denylist, which is what makes it safe for
// long-lived tokens: a lost marker denies rather than silently permits.
//
// Redis lookups sit on the hot path, so decisions are cached in memory with two
// horizons. Within the short *fresh* TTL a jti is served straight from cache. If
// Redis is unreachable on a miss, a previously-valid jti is still honored until
// its longer *grace* TTL elapses — bounded grace, then deny. A jti that was
// never confirmed valid (revoked, unknown, or first-seen during an outage) is
// denied immediately. The caller maps the decision to allow/deny.
package revocation

import (
	"container/list"
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Decision is the outcome of a validity check.
type Decision int

const (
	// DecisionValid — the marker was confirmed present (fresh cache or Redis).
	DecisionValid Decision = iota
	// DecisionInvalid — the marker was confirmed absent: revoked or never issued.
	DecisionInvalid
	// DecisionGrace — Redis is unreachable, but a previously-valid jti is still
	// inside its grace window. Allowed, degraded.
	DecisionGrace
	// DecisionUnavailable — Redis is unreachable and no valid grace entry exists.
	// Denied (fail closed, bounded).
	DecisionUnavailable
)

// Validator decides whether a restic token jti may currently be used.
type Validator interface {
	Check(ctx context.Context, jti string) (Decision, error)
}

const cacheSize = 8192

func keyFor(jti string) string {
	return "yucca:restic:valid:" + jti
}

type RedisValidator struct {
	client   *redis.Client
	timeout  time.Duration
	freshTTL time.Duration
	graceTTL time.Duration
	cache    *resultCache
}

// NewRedisValidator builds a validator. freshTTL is how long a confirmed
// decision is served without touching Redis; graceTTL (≥ freshTTL) is how long a
// previously-valid jti keeps being honored while Redis is unreachable.
func NewRedisValidator(addr string, timeout, freshTTL, graceTTL time.Duration) *RedisValidator {
	return &RedisValidator{
		client: redis.NewClient(&redis.Options{
			Addr:         addr,
			DialTimeout:  timeout,
			ReadTimeout:  timeout,
			WriteTimeout: timeout,
			MaxRetries:   1,
		}),
		timeout:  timeout,
		freshTTL: freshTTL,
		graceTTL: graceTTL,
		cache:    newResultCache(cacheSize),
	}
}

func (r *RedisValidator) Check(ctx context.Context, jti string) (Decision, error) {
	now := time.Now()
	if valid, ok := r.cache.getFresh(jti, now); ok {
		if valid {
			return DecisionValid, nil
		}
		return DecisionInvalid, nil
	}

	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	n, err := r.client.Exists(ctx, keyFor(jti)).Result()
	if err != nil {
		// Redis unreachable: honor a previously-valid jti within grace, else deny.
		// The error is NOT cached, so the next request retries Redis.
		if r.cache.graceValid(jti, now) {
			return DecisionGrace, err
		}
		return DecisionUnavailable, err
	}

	valid := n > 0
	r.cache.put(jti, valid, now.Add(r.freshTTL), now.Add(r.graceTTL))
	if valid {
		return DecisionValid, nil
	}
	return DecisionInvalid, nil
}

func (r *RedisValidator) Close() error {
	return r.client.Close()
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
// the only case where an unreachable Redis is allowed to pass a request.
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
