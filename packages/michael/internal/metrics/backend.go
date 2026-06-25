package metrics

import (
	"context"
	"fmt"

	"michael/internal/storage"

	"go.opentelemetry.io/otel/attribute"
	otelmetric "go.opentelemetry.io/otel/metric"
)

// BackendStatsProvider yields a per-backend snapshot. *storage.Pool implements
// it. Kept as an interface so the metrics layer doesn't depend on the pool's
// internals and can be tested with a stub.
type BackendStatsProvider interface {
	Stats() []storage.BackendStat
}

// RegisterBackendMetrics wires per-backend S3 load-balancer metrics onto meter.
// All instruments are observable: a single registered callback reads the
// provider's snapshot each collection cycle and emits one series per backend
// (tagged with a "backend" attribute), so the storage hot path stays free of
// any OTel calls. The cumulative counters (requests/errors/bytes) are reported
// as observable counters since the pool already keeps monotonic atomics.
func RegisterBackendMetrics(meter otelmetric.Meter, provider BackendStatsProvider) error {
	requests, err := meter.Int64ObservableCounter("s3.backend.requests",
		otelmetric.WithDescription("Total S3 requests routed to each backend gateway"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.requests: %w", err)
	}
	requestErrors, err := meter.Int64ObservableCounter("s3.backend.errors",
		otelmetric.WithDescription("Total S3 backend transport failures per gateway"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.errors: %w", err)
	}
	downloaded, err := meter.Int64ObservableCounter("s3.backend.downloaded_bytes",
		otelmetric.WithDescription("Total bytes downloaded from each backend gateway"),
		otelmetric.WithUnit("By"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.downloaded_bytes: %w", err)
	}
	uploaded, err := meter.Int64ObservableCounter("s3.backend.uploaded_bytes",
		otelmetric.WithDescription("Total bytes uploaded to each backend gateway"),
		otelmetric.WithUnit("By"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.uploaded_bytes: %w", err)
	}
	inflight, err := meter.Int64ObservableGauge("s3.backend.inflight",
		otelmetric.WithDescription("Outstanding requests per backend gateway"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.inflight: %w", err)
	}
	healthy, err := meter.Int64ObservableGauge("s3.backend.healthy",
		otelmetric.WithDescription("Backend gateway health (1 healthy, 0 ejected)"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.healthy: %w", err)
	}

	_, err = meter.RegisterCallback(
		func(_ context.Context, o otelmetric.Observer) error {
			for _, s := range provider.Stats() {
				attrs := otelmetric.WithAttributeSet(attribute.NewSet(
					attribute.String("backend", s.Endpoint),
				))
				o.ObserveInt64(requests, s.Requests, attrs)
				o.ObserveInt64(requestErrors, s.Errors, attrs)
				o.ObserveInt64(downloaded, s.DownloadedBytes, attrs)
				o.ObserveInt64(uploaded, s.UploadedBytes, attrs)
				o.ObserveInt64(inflight, s.Inflight, attrs)
				o.ObserveInt64(healthy, boolToInt64(s.Healthy), attrs)
			}
			return nil
		},
		requests, requestErrors, downloaded, uploaded, inflight, healthy,
	)
	if err != nil {
		return fmt.Errorf("registering backend metrics callback: %w", err)
	}
	return nil
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
