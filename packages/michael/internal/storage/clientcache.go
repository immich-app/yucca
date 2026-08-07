package storage

import (
	"container/list"
	"sync"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Sized to span the repositories backing up concurrently: restic holds one
// credential for a whole session, and an entry is only an options struct.
const clientCacheSize = 1024

// clientCache is a bounded LRU of S3 clients keyed by credential fingerprint.
// Every client wraps the same *http.Client, so the connection pool is shared
// and an eviction costs nothing but the SDK's per-client state.
type clientCache struct {
	mu      sync.Mutex
	max     int
	order   *list.List
	entries map[[32]byte]*list.Element
}

type clientEntry struct {
	key    [32]byte
	client *s3.Client
}

func newClientCache(max int) *clientCache {
	return &clientCache{
		max:     max,
		order:   list.New(),
		entries: make(map[[32]byte]*list.Element, max),
	}
}

func (c *clientCache) get(key [32]byte) (*s3.Client, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	el, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	c.order.MoveToFront(el)
	return el.Value.(*clientEntry).client, true
}

func (c *clientCache) put(key [32]byte, client *s3.Client) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if el, ok := c.entries[key]; ok {
		el.Value.(*clientEntry).client = client
		c.order.MoveToFront(el)
		return
	}
	c.entries[key] = c.order.PushFront(&clientEntry{key: key, client: client})
	if c.order.Len() > c.max {
		el := c.order.Back()
		c.order.Remove(el)
		delete(c.entries, el.Value.(*clientEntry).key)
	}
}
