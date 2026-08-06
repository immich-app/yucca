package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"michael/internal/geoip"

	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

// Decomposes the per-request cost of source-network accounting: the attribute
// lookup, then the three counter recordings the middleware performs. Compare
// against geoip.BenchmarkResolve (the database side) to see which half of the
// feature dominates.

func benchMeterMetrics(b *testing.B) *Metrics {
	b.Helper()
	m, err := NewMetrics(sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewManualReader()),
	).Meter("bench"))
	if err != nil {
		b.Fatalf("NewMetrics: %v", err)
	}
	return m
}

// The cache hit path, which is what every request after the first from a given
// network takes.
func BenchmarkASNOption(b *testing.B) {
	ASNOption("AS64496", "Example Transit")

	b.ReportAllocs()
	for b.Loop() {
		_ = ASNOption("AS64496", "Example Transit")
	}
}

func BenchmarkTrafficMiddleware(b *testing.B) {
	m := benchMeterMetrics(b)

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if _, err := w.Write([]byte("ok")); err != nil {
			b.Errorf("write: %v", err)
		}
	})
	handler := TrafficMiddleware(m)(inner)

	req := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
	req = req.WithContext(geoip.NewContext(req.Context(), geoip.Client{
		IP:  "203.0.113.7",
		ASN: "AS64496",
		Org: "Example Transit",
	}))

	b.ReportAllocs()
	for b.Loop() {
		mrw := &ResponseWriter{ResponseWriter: httptest.NewRecorder()}
		handler.ServeHTTP(mrw, req)
	}
}

// The baseline the above should be read against: the same wrapper work without
// the traffic counters, so the difference is the accounting itself.
func BenchmarkTrafficMiddlewareBaseline(b *testing.B) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if _, err := w.Write([]byte("ok")); err != nil {
			b.Errorf("write: %v", err)
		}
	})

	req := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)

	b.ReportAllocs()
	for b.Loop() {
		mrw := &ResponseWriter{ResponseWriter: httptest.NewRecorder()}
		inner.ServeHTTP(mrw, req)
	}
}
