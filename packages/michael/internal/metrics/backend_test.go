package metrics

import (
	"context"
	"testing"

	"michael/internal/storage"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

type stubProvider struct {
	stats []storage.BackendStat
	pool  storage.PoolStat
}

func (s stubProvider) Stats() []storage.BackendStat { return s.stats }
func (s stubProvider) PoolStats() storage.PoolStat  { return s.pool }

func TestRegisterBackendMetrics(t *testing.T) {
	reader := metric.NewManualReader()
	mp := metric.NewMeterProvider(metric.WithReader(reader))
	meter := mp.Meter("test")

	providers := map[string]BackendStatsProvider{
		"default": stubProvider{
			stats: []storage.BackendStat{
				{Endpoint: "http://a:80", Healthy: true, State: "closed", Inflight: 2, Requests: 10, Errors: 1, DownloadedBytes: 100, UploadedBytes: 50},
				{Endpoint: "http://b:80", Healthy: false, State: "half_open", Inflight: 0, Requests: 3, Errors: 3, DownloadedBytes: 0, UploadedBytes: 7},
			},
			pool: storage.PoolStat{RetryAttempts: 5, RetrySuccesses: 4, RetryDenied: 2, RetryBudget: 150, ShedRequests: 9, CanaryRequests: 3},
		},
		// Same endpoint as the default cluster's first backend: only the cluster
		// attribute keeps the two series apart.
		"spice": stubProvider{stats: []storage.BackendStat{
			{Endpoint: "http://a:80", Healthy: true, Inflight: 1, Requests: 4, Errors: 0, DownloadedBytes: 9, UploadedBytes: 2},
		}},
	}
	if err := RegisterBackendMetrics(meter, providers); err != nil {
		t.Fatalf("RegisterBackendMetrics: %v", err)
	}

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatalf("Collect: %v", err)
	}

	// Index every emitted (metric, cluster/backend) -> value.
	got := map[string]map[string]int64{}
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			bySeries := map[string]int64{}
			switch d := m.Data.(type) {
			case metricdata.Sum[int64]:
				for _, dp := range d.DataPoints {
					bySeries[seriesKey(dp.Attributes)] = dp.Value
				}
			case metricdata.Gauge[int64]:
				for _, dp := range d.DataPoints {
					bySeries[seriesKey(dp.Attributes)] = dp.Value
				}
			}
			got[m.Name] = bySeries
		}
	}

	checks := []struct {
		metric, series string
		want           int64
	}{
		{"s3.backend.requests", "default/http://a:80", 10},
		{"s3.backend.errors", "default/http://b:80", 3},
		{"s3.backend.downloaded_bytes", "default/http://a:80", 100},
		{"s3.backend.uploaded_bytes", "default/http://b:80", 7},
		{"s3.backend.inflight", "default/http://a:80", 2},
		{"s3.backend.healthy", "default/http://a:80", 1},
		{"s3.backend.healthy", "default/http://b:80", 0},
		// The second cluster's identically-addressed backend stays its own series.
		{"s3.backend.requests", "spice/http://a:80", 4},
		{"s3.backend.inflight", "spice/http://a:80", 1},
		// Pool-wide retry series carry cluster+outcome, no backend.
		{"s3.pool.retries", "default//success", 4},
		{"s3.pool.retries", "default//failure", 1},
		{"s3.pool.retries", "default//denied", 2},
		{"s3.pool.retry_budget", "default/", 150},
		{"s3.pool.retries", "spice//success", 0},
		{"s3.backend.state", "default/http://a:80", 2},
		{"s3.backend.state", "default/http://b:80", 1},
		{"s3.pool.sheds", "default/", 9},
		{"s3.pool.canaries", "default/", 3},
	}
	for _, c := range checks {
		series, ok := got[c.metric]
		if !ok {
			t.Errorf("metric %q not emitted", c.metric)
			continue
		}
		if v, ok := series[c.series]; !ok || v != c.want {
			t.Errorf("%s{%s} = %d (present=%v), want %d", c.metric, c.series, v, ok, c.want)
		}
	}
}

func seriesKey(set attribute.Set) string {
	key := attrValue(set, "cluster") + "/" + attrValue(set, "backend")
	if outcome := attrValue(set, "outcome"); outcome != "" {
		key += "/" + outcome
	}
	return key
}

func attrValue(set attribute.Set, key attribute.Key) string {
	v, ok := set.Value(key)
	if !ok {
		return ""
	}
	return v.AsString()
}
