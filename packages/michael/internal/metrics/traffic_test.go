package metrics

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"michael/internal/geoip"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

func TestASNOption(t *testing.T) {
	a := ASNOption("AS64496", "Example Transit")
	if a != ASNOption("AS64496", "Example Transit") {
		t.Fatal("expected cached ASNOption to return the same object")
	}
	if a == ASNOption("AS64497", "Example Transit") {
		t.Fatal("different AS numbers should produce different options")
	}
	if a == ASNOption("AS64496", "Renamed Transit") {
		t.Fatal("different organizations should produce different options")
	}
}

// Counts EVERY request, not just authed 2xx (blobs.*): a rejected flood is the
// per-network view's point, and it moves almost no bytes.
func TestTrafficMiddlewareCountsRejectedRequests(t *testing.T) {
	reader := metric.NewManualReader()
	m, err := NewMetrics(metric.NewMeterProvider(metric.WithReader(reader)).Meter("test"))
	if err != nil {
		t.Fatalf("NewMetrics: %v", err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			t.Errorf("draining body: %v", err)
		}
		w.WriteHeader(http.StatusUnauthorized)
		if _, err := w.Write([]byte("denied")); err != nil {
			t.Errorf("writing body: %v", err)
		}
	})

	req := httptest.NewRequest(http.MethodPost, "/repo/data/abc", strings.NewReader("nine byte"))
	req = req.WithContext(geoip.NewContext(req.Context(), geoip.Client{
		IP:  "203.0.113.7",
		ASN: "AS64496",
		Org: "Example Transit",
	}))
	mrw := &ResponseWriter{ResponseWriter: httptest.NewRecorder()}
	TrafficMiddleware(m)(inner).ServeHTTP(mrw, req)

	const asn = "AS64496"
	if got := trafficValue(t, reader, "traffic.requests", asn); got != 1 {
		t.Errorf("traffic.requests{asn=%s} = %d, want 1", asn, got)
	}
	if got := trafficValue(t, reader, "traffic.uploaded_bytes", asn); got != 9 {
		t.Errorf("traffic.uploaded_bytes{asn=%s} = %d, want 9", asn, got)
	}
	if got := trafficValue(t, reader, "traffic.downloaded_bytes", asn); got != 6 {
		t.Errorf("traffic.downloaded_bytes{asn=%s} = %d, want 6", asn, got)
	}
}

// With nothing resolving the client the request still gets a series, under the
// unknown sentinel — a gap in the graph would read as "no traffic".
func TestTrafficMiddlewareUnresolvedClient(t *testing.T) {
	reader := metric.NewManualReader()
	m, err := NewMetrics(metric.NewMeterProvider(metric.WithReader(reader)).Meter("test"))
	if err != nil {
		t.Fatalf("NewMetrics: %v", err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mrw := &ResponseWriter{ResponseWriter: httptest.NewRecorder()}
	TrafficMiddleware(m)(inner).ServeHTTP(mrw, httptest.NewRequest(http.MethodGet, "/repo/config", nil))

	if got := trafficValue(t, reader, "traffic.requests", geoip.ASNUnknown); got != 1 {
		t.Errorf("traffic.requests{asn=%s} = %d, want 1", geoip.ASNUnknown, got)
	}
}

// A plain ResponseWriter means Middleware is not mounted; the request must
// still be served, just unmeasured.
func TestTrafficMiddlewarePassesThroughUnwrappedWriter(t *testing.T) {
	m, err := NewMetrics(metric.NewMeterProvider().Meter("test"))
	if err != nil {
		t.Fatalf("NewMetrics: %v", err)
	}

	served := false
	inner := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) { served = true })
	TrafficMiddleware(m)(inner).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	if !served {
		t.Fatal("expected the request to be served")
	}
}

// trafficValue returns the collected value of metric name for the series
// labelled with asn, or -1 when that series was not emitted.
func trafficValue(t *testing.T, reader metric.Reader, name, asn string) int64 {
	t.Helper()
	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatalf("Collect: %v", err)
	}
	for _, sm := range rm.ScopeMetrics {
		for _, md := range sm.Metrics {
			if md.Name != name {
				continue
			}
			sum, ok := md.Data.(metricdata.Sum[int64])
			if !ok {
				t.Fatalf("%s is %T, want a Sum[int64]", name, md.Data)
			}
			for _, dp := range sum.DataPoints {
				if v, ok := dp.Attributes.Value(attribute.Key("asn")); ok && v.AsString() == asn {
					return dp.Value
				}
			}
		}
	}
	return -1
}
