package auth

import (
	"container/list"
	"sync"
	"time"
)

type cacheEntry struct {
	key  [32]byte
	auth Auth
	exp  time.Time
}

// tokenCache is a bounded LRU of verified tokens, keyed by a hash of the
// Authorization header so raw tokens are never retained.
type tokenCache struct {
	mu  sync.Mutex
	max int
	ll  *list.List // front = most recently used
	m   map[[32]byte]*list.Element
}

func newTokenCache(max int) *tokenCache {
	return &tokenCache{
		max: max,
		ll:  list.New(),
		m:   make(map[[32]byte]*list.Element, max),
	}
}

func (c *tokenCache) get(key [32]byte, now time.Time) (Auth, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.m[key]
	if !ok {
		return Auth{}, false
	}
	e := el.Value.(*cacheEntry)
	if !now.Before(e.exp) {
		c.ll.Remove(el)
		delete(c.m, key)
		return Auth{}, false
	}
	c.ll.MoveToFront(el)
	return e.auth, true
}

func (c *tokenCache) put(key [32]byte, a Auth, exp time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.m[key]; ok {
		e := el.Value.(*cacheEntry)
		e.auth, e.exp = a, exp
		c.ll.MoveToFront(el)
		return
	}
	c.m[key] = c.ll.PushFront(&cacheEntry{key: key, auth: a, exp: exp})
	if c.ll.Len() > c.max {
		el := c.ll.Back()
		c.ll.Remove(el)
		delete(c.m, el.Value.(*cacheEntry).key)
	}
}
