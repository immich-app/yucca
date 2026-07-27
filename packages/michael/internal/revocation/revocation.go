// Package revocation checks restic-token jtis against the Redis denylist
// written by yucca-api/yucca-admin-api and reconciled by the metrics-worker.
// Lookups sit on the hot path, so results are cached briefly in memory; the
// caller decides what to do on error (michael fails open).
package revocation

import (
	"container/list"
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Revoker interface {
	IsRevoked(ctx context.Context, jti string) (bool, error)
}

const cacheSize = 8192

func keyFor(jti string) string {
	return "yucca:restic:revoked:" + jti
}

type RedisRevoker struct {
	client   *redis.Client
	timeout  time.Duration
	cacheTTL time.Duration
	cache    *resultCache
}

func NewRedisRevoker(addr string, timeout, cacheTTL time.Duration) *RedisRevoker {
	return &RedisRevoker{
		client: redis.NewClient(&redis.Options{
			Addr:         addr,
			DialTimeout:  timeout,
			ReadTimeout:  timeout,
			WriteTimeout: timeout,
			MaxRetries:   1,
		}),
		timeout:  timeout,
		cacheTTL: cacheTTL,
		cache:    newResultCache(cacheSize),
	}
}

func (r *RedisRevoker) IsRevoked(ctx context.Context, jti string) (bool, error) {
	now := time.Now()
	if revoked, ok := r.cache.get(jti, now); ok {
		return revoked, nil
	}

	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	n, err := r.client.Exists(ctx, keyFor(jti)).Result()
	if err != nil {
		// Errors are NOT cached: the next request retries, and the caller
		// fails open in the meantime.
		return false, err
	}

	revoked := n > 0
	r.cache.put(jti, revoked, now.Add(r.cacheTTL))
	return revoked, nil
}

func (r *RedisRevoker) Close() error {
	return r.client.Close()
}

// resultCache is a bounded LRU of jti → revoked with per-entry expiry
// (mirrors internal/auth's tokenCache).
type resultCache struct {
	mu      sync.Mutex
	max     int
	order   *list.List
	entries map[string]*list.Element
}

type cacheEntry struct {
	jti     string
	revoked bool
	exp     time.Time
}

func newResultCache(max int) *resultCache {
	return &resultCache{
		max:     max,
		order:   list.New(),
		entries: make(map[string]*list.Element, max),
	}
}

func (c *resultCache) get(jti string, now time.Time) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.entries[jti]
	if !ok {
		return false, false
	}
	entry := e.Value.(*cacheEntry)
	if !now.Before(entry.exp) {
		c.order.Remove(e)
		delete(c.entries, jti)
		return false, false
	}
	c.order.MoveToFront(e)
	return entry.revoked, true
}

func (c *resultCache) put(jti string, revoked bool, exp time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if e, ok := c.entries[jti]; ok {
		entry := e.Value.(*cacheEntry)
		entry.revoked = revoked
		entry.exp = exp
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
	c.entries[jti] = c.order.PushFront(&cacheEntry{jti: jti, revoked: revoked, exp: exp})
}
