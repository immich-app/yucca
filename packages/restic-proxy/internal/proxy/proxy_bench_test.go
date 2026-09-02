package proxy

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"restic-proxy/internal/client"
	"restic-proxy/internal/meta"
)

// sink discards the proxied response so the benchmark measures the proxy rather
// than the recorder's buffering.
type sink struct{ header http.Header }

func (s *sink) Header() http.Header {
	if s.header == nil {
		s.header = http.Header{}
	}
	return s.header
}

func (s *sink) Write(payload []byte) (int, error) { return len(payload), nil }

func (s *sink) WriteHeader(int) {}

func warmHandler(b *testing.B, backendURL string) *Handler {
	b.Helper()

	handler := New(client.New(meta.Meta{ApiUrl: "http://unused.example"}))
	handler.grants.Set(testRepository, client.Grant{
		Scheme:    "http",
		Host:      hostForBench(b, backendURL),
		Path:      "/" + testRepository,
		Password:  "minted-jwt",
		ExpiresAt: time.Now().Add(time.Hour),
	})

	return handler
}

func hostForBench(b *testing.B, rawURL string) string {
	b.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		b.Fatalf("parse %s: %v", rawURL, err)
	}
	return parsed.Host
}

func benchmarkUpload(b *testing.B, size int) {
	b.Helper()

	backend := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = io.Copy(io.Discard, request.Body)
		writer.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	handler := warmHandler(b, backend.URL)
	payload := bytes.Repeat([]byte("x"), size)

	b.SetBytes(int64(size))
	b.ReportAllocs()
	b.ResetTimer()

	for range b.N {
		request := httptest.NewRequest(http.MethodPost, "/data/ab", bytes.NewReader(payload))
		request.SetBasicAuth(testRepository, testToken)
		handler.ServeHTTP(&sink{}, request)
	}
}

func benchmarkDownload(b *testing.B, size int) {
	b.Helper()

	payload := bytes.Repeat([]byte("x"), size)
	backend := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write(payload)
	}))
	defer backend.Close()

	handler := warmHandler(b, backend.URL)

	b.SetBytes(int64(size))
	b.ReportAllocs()
	b.ResetTimer()

	for range b.N {
		request := httptest.NewRequest(http.MethodGet, "/data/ab", nil)
		request.SetBasicAuth(testRepository, testToken)
		handler.ServeHTTP(&sink{}, request)
	}
}

func BenchmarkUpload16MiB(b *testing.B) { benchmarkUpload(b, 16<<20) }

func BenchmarkUpload64KiB(b *testing.B) { benchmarkUpload(b, 64<<10) }

func BenchmarkDownload16MiB(b *testing.B) { benchmarkDownload(b, 16<<20) }

func BenchmarkDownload64KiB(b *testing.B) { benchmarkDownload(b, 64<<10) }

// BenchmarkGrantCacheHit isolates the per-request cost the proxy adds on top of
// the round trip: the grant lookup every request pays.
func BenchmarkGrantCacheHit(b *testing.B) {
	handler := New(client.New(meta.Meta{ApiUrl: "http://unused.example"}))
	handler.grants.Set(testRepository, client.Grant{ExpiresAt: time.Now().Add(time.Hour)})

	b.ReportAllocs()
	b.ResetTimer()

	for range b.N {
		if _, err := handler.grant(testRepository, testToken); err != nil {
			b.Fatalf("unexpected error: %v", err)
		}
	}
}
