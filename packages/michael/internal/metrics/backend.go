package metrics

import (
	"context"
	"fmt"

	"michael/internal/storage"

	"go.opentelemetry.io/otel/attribute"
	otelmetric "go.opentelemetry.io/otel/metric"
)

// BackendStatsProvider yields per-backend and pool-wide snapshots.
// *storage.Pool implements it. Kept as an interface so the metrics layer
// doesn't depend on the pool's internals and can be tested with a stub.
type BackendStatsProvider interface {
	Stats() []storage.BackendStat
	PoolStats() storage.PoolStat
}

// RegisterBackendMetrics wires per-backend S3 load-balancer metrics onto meter,
// one provider per storage cluster keyed by cluster code. All instruments are
// observable: a single registered callback reads every provider's snapshot each
// collection cycle and emits one series per backend (tagged with "cluster" and
// "backend" attributes), so the storage hot path stays free of any OTel calls.
// The cumulative counters (requests/errors/bytes) are reported as observable
// counters since the pool already keeps monotonic atomics.
//
// The "cluster" attribute is what keeps two clusters' gateways apart: endpoints
// are per-cluster addresses and nothing stops two clusters resolving the same
// one (e.g. both behind the same in-cluster service name in dev).
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
	state, err := meter.Int64ObservableGauge("s3.backend.state",
		otelmetric.WithDescription("Backend circuit-breaker state (0 open, 1 half-open, 2 closed)"))
	if err != nil {
		return fmt.Errorf("creating s3.backend.state: %w", err)
	}
	retries, err := meter.Int64ObservableCounter("s3.pool.retries",
		otelmetric.WithDescription("Cross-backend retries per pool, by outcome (success, failure, denied)"))
	if err != nil {
		return fmt.Errorf("creating s3.pool.retries: %w", err)
	}
	retryBudget, err := meter.Int64ObservableGauge("s3.pool.retry_budget",
		otelmetric.WithDescription("Remaining cross-backend retry budget tokens per pool"))
	if err != nil {
		return fmt.Errorf("creating s3.pool.retry_budget: %w", err)
	}
	sheds, err := meter.Int64ObservableCounter("s3.pool.sheds",
		otelmetric.WithDescription("Requests fast-failed because every backend was unhealthy"))
	if err != nil {
		return fmt.Errorf("creating s3.pool.sheds: %w", err)
	}
	canaries, err := meter.Int64ObservableCounter("s3.pool.canaries",
		otelmetric.WithDescription("Fail-open canary requests sent while every backend was unhealthy"))
	if err != nil {
		return fmt.Errorf("creating s3.pool.canaries: %w", err)
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
					o.ObserveInt64(state, stateValue(s.State), attrs)
				}
				ps := provider.PoolStats()
				cluster := attribute.String("cluster", code)
				clusterAttrs := otelmetric.WithAttributeSet(attribute.NewSet(cluster))
				retryOutcome := func(outcome string) otelmetric.MeasurementOption {
					return otelmetric.WithAttributeSet(attribute.NewSet(cluster, attribute.String("outcome", outcome)))
				}
				o.ObserveInt64(retries, ps.RetrySuccesses, retryOutcome("success"))
				o.ObserveInt64(retries, ps.RetryAttempts-ps.RetrySuccesses, retryOutcome("failure"))
				o.ObserveInt64(retries, ps.RetryDenied, retryOutcome("denied"))
				o.ObserveInt64(retryBudget, ps.RetryBudget, clusterAttrs)
				o.ObserveInt64(sheds, ps.ShedRequests, clusterAttrs)
				o.ObserveInt64(canaries, ps.CanaryRequests, clusterAttrs)
			}
			return nil
		},
		requests, requestErrors, downloaded, uploaded, inflight, healthy, state, retries, retryBudget, sheds, canaries,
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

// stateValue orders breaker states by serviceability so dashboards can
// threshold on them: 0 open, 1 half-open, 2 closed.
func stateValue(state string) int64 {
	switch state {
	case "closed":
		return 2
	case "half_open":
		return 1
	default:
		return 0
	}
}
