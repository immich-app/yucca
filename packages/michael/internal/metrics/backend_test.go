package metrics

import (
	"context"
	"testing"

	"michael/internal/storage"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

type stubProvider struct{ stats []storage.BackendStat }

func (s stubProvider) Stats() []storage.BackendStat { return s.stats }

func TestRegisterBackendMetrics(t *testing.T) {
	reader := metric.NewManualReader()
	mp := metric.NewMeterProvider(metric.WithReader(reader))
	meter := mp.Meter("test")

	provider := stubProvider{stats: []storage.BackendStat{
		{Endpoint: "http://a:80", Healthy: true, Inflight: 2, Requests: 10, Errors: 1, DownloadedBytes: 100, UploadedBytes: 50},
		{Endpoint: "http://b:80", Healthy: false, Inflight: 0, Requests: 3, Errors: 3, DownloadedBytes: 0, UploadedBytes: 7},
	}}
	if err := RegisterBackendMetrics(meter, provider); err != nil {
		t.Fatalf("RegisterBackendMetrics: %v", err)
	}

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatalf("Collect: %v", err)
	}

	// Index every emitted (metric, backend) -> value.
	got := map[string]map[string]int64{}
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			byBackend := map[string]int64{}
			switch d := m.Data.(type) {
			case metricdata.Sum[int64]:
				for _, dp := range d.DataPoints {
					byBackend[backendAttr(dp.Attributes)] = dp.Value
				}
			case metricdata.Gauge[int64]:
				for _, dp := range d.DataPoints {
					byBackend[backendAttr(dp.Attributes)] = dp.Value
				}
			}
			got[m.Name] = byBackend
		}
	}

	checks := []struct {
		metric, backend string
		want            int64
	}{
		{"s3.backend.requests", "http://a:80", 10},
		{"s3.backend.errors", "http://b:80", 3},
		{"s3.backend.downloaded_bytes", "http://a:80", 100},
		{"s3.backend.uploaded_bytes", "http://b:80", 7},
		{"s3.backend.inflight", "http://a:80", 2},
		{"s3.backend.healthy", "http://a:80", 1},
		{"s3.backend.healthy", "http://b:80", 0},
	}
	for _, c := range checks {
		series, ok := got[c.metric]
		if !ok {
			t.Errorf("metric %q not emitted", c.metric)
			continue
		}
		if v, ok := series[c.backend]; !ok || v != c.want {
			t.Errorf("%s{backend=%s} = %d (present=%v), want %d", c.metric, c.backend, v, ok, c.want)
		}
	}
}

func backendAttr(set attribute.Set) string {
	v, ok := set.Value("backend")
	if !ok {
		return ""
	}
	return v.AsString()
}
