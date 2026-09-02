package proxy

import (
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"restic-proxy/internal/client"
)

func TestReverse_BackendUnauthorizedBecomesRetryable(t *testing.T) {
	backend := newBackend(t, http.StatusUnauthorized, nil)
	handler, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, nil))

	response := do(t, proxy, "/config", testRepository, testToken)

	if response.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", response.StatusCode)
	}
	if _, ok := handler.grants.Get(testRepository); ok {
		t.Error("expected the rejected grant to be evicted")
	}
}

func TestReverse_RetryAfterEvictionMintsAgain(t *testing.T) {
	var mints atomic.Int64
	backend := newBackend(t, http.StatusUnauthorized, nil)
	_, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, &mints))

	do(t, proxy, "/config", testRepository, testToken)
	do(t, proxy, "/config", testRepository, testToken)

	if mints.Load() != 2 {
		t.Errorf("expected the second attempt to mint again, got %d mints", mints.Load())
	}
}

func TestReverse_BackendSuccessIsUntouched(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	handler, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, nil))

	response := do(t, proxy, "/config", testRepository, testToken)

	if response.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", response.StatusCode)
	}
	if _, ok := handler.grants.Get(testRepository); !ok {
		t.Error("expected the grant to survive a successful request")
	}
}

func TestReverse_BackendUnreachable(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	host := hostOf(t, backend.URL)
	handler, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, nil))
	backend.Close()

	handler.grants.Set(testRepository, client.Grant{
		Scheme:    "http",
		Host:      host,
		Path:      "/" + testRepository,
		Password:  "some-jwt",
		ExpiresAt: time.Now().Add(time.Hour),
	})

	response := do(t, proxy, "/config", testRepository, testToken)

	if response.StatusCode != http.StatusBadGateway {
		t.Errorf("expected 502, got %d", response.StatusCode)
	}
}

func TestBufferPool_RoundTrip(t *testing.T) {
	pool := newBufferPool()

	buffer := pool.Get()
	if len(buffer) != copyBufferSize {
		t.Errorf("expected a %d byte buffer, got %d", copyBufferSize, len(buffer))
	}

	pool.Put(buffer)

	if reused := pool.Get(); len(reused) != copyBufferSize {
		t.Errorf("expected a %d byte buffer after reuse, got %d", copyBufferSize, len(reused))
	}
}

func TestNewTransport_DoesNotCompress(t *testing.T) {
	transport := newTransport()

	if !transport.DisableCompression {
		t.Error("expected compression to be disabled")
	}
	if transport.MaxIdleConnsPerHost != 32 {
		t.Errorf("expected 32 idle connections per host, got %d", transport.MaxIdleConnsPerHost)
	}
}
