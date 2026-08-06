package metrics

import (
	"context"
	"fmt"

	"michael/internal/storage"

	"go.opentelemetry.io/otel/attribute"
	otelmetric "go.opentelemetry.io/otel/metric"
)

// *storage.Pool implements this.
type BackendStatsProvider interface {
	Stats() []storage.BackendStat
}

// RegisterBackendMetrics wires per-backend S3 load-balancer metrics, one
// provider per cluster code. All instruments are observable — one callback
// reads snapshots per collection, keeping the storage hot path free of OTel
// calls; cumulative counters ride the pool's monotonic atomics. The "cluster"
// attribute disambiguates gateways two clusters may resolve identically (e.g.
// same in-cluster service name in dev).
func RegisterBackendMetrics(meter otelmetric.Meter, providers map[string]BackendStatsProvider) error {
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
			for code, provider := range providers {
				for _, s := range provider.Stats() {
					attrs := otelmetric.WithAttributeSet(attribute.NewSet(
						attribute.String("cluster", code),
						attribute.String("backend", s.Endpoint),
					))
					o.ObserveInt64(requests, s.Requests, attrs)
					o.ObserveInt64(requestErrors, s.Errors, attrs)
					o.ObserveInt64(downloaded, s.DownloadedBytes, attrs)
					o.ObserveInt64(uploaded, s.UploadedBytes, attrs)
					o.ObserveInt64(inflight, s.Inflight, attrs)
					o.ObserveInt64(healthy, boolToInt64(s.Healthy), attrs)
				}
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
