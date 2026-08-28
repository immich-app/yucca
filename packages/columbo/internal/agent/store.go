package agent

import (
	"fmt"
	"sync"
)

// ResultStore keeps full tool results in harness memory so the model can
// post-process large payloads by reference (via the jq tool) without them
// ever entering the context window whole.
type ResultStore struct {
	mu      sync.Mutex
	results map[string]string
	next    int
}

func NewResultStore() *ResultStore {
	return &ResultStore{results: map[string]string{}}
}

func (s *ResultStore) Put(value string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next++
	ref := fmt.Sprintf("r%d", s.next)
	s.results[ref] = value
	return ref
}

func (s *ResultStore) Get(ref string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.results[ref]
	return value, ok
}
