package metrics

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"net/http/httptrace"
	"sync"
	"time"

	"go.opentelemetry.io/otel/attribute"
	otelmetric "go.opentelemetry.io/otel/metric"
)

// TransportMetrics instruments the per-backend S3 HTTP transports: connection
// churn (dials, reuse ratio), TLS handshake cost, and time-to-first-byte from
// the gateway. These separate RGW latency from michael's own overhead and
// prove out connection-pool tuning.
type TransportMetrics struct {
	dials       otelmetric.Int64Counter
	conns       otelmetric.Int64Counter
	tlsDuration otelmetric.Float64Histogram
	ttfb        otelmetric.Float64Histogram
}

func NewTransportMetrics(meter otelmetric.Meter) (*TransportMetrics, error) {
	dials, err := meter.Int64Counter("s3.client.dials",
		otelmetric.WithDescription("New TCP connections dialed to S3 backends"))
	if err != nil {
		return nil, fmt.Errorf("creating s3_client_dials counter: %w", err)
	}

	conns, err := meter.Int64Counter("s3.client.connections",
		otelmetric.WithDescription("Connections checked out for S3 requests, by reuse"))
	if err != nil {
		return nil, fmt.Errorf("creating s3_client_connections counter: %w", err)
	}

	tlsDuration, err := meter.Float64Histogram("s3.client.tls_handshake.duration",
		otelmetric.WithDescription("TLS handshake duration to S3 backends"),
		otelmetric.WithUnit("s"),
		otelmetric.WithExplicitBucketBoundaries(durationBuckets...))
	if err != nil {
		return nil, fmt.Errorf("creating s3_client_tls_handshake histogram: %w", err)
	}

	ttfb, err := meter.Float64Histogram("s3.client.ttfb",
		otelmetric.WithDescription("Time from S3 request start to first response byte"),
		otelmetric.WithUnit("s"),
		otelmetric.WithExplicitBucketBoundaries(durationBuckets...))
	if err != nil {
		return nil, fmt.Errorf("creating s3_client_ttfb histogram: %w", err)
	}

	return &TransportMetrics{
		dials:       dials,
		conns:       conns,
		tlsDuration: tlsDuration,
		ttfb:        ttfb,
	}, nil
}

// Wrap returns rt instrumented with per-request httptrace hooks, labeled with
// the backend's address.
func (t *TransportMetrics) Wrap(backend string, rt http.RoundTripper) http.RoundTripper {
	return &tracedTransport{tm: t, backend: backend, rt: rt}
}

type tracedTransport struct {
	tm      *TransportMetrics
	backend string
	rt      http.RoundTripper
}

func (t *tracedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	start := time.Now()
	var tlsStart time.Time
	ctx := req.Context()
	trace := &httptrace.ClientTrace{
		ConnectDone: func(_, _ string, err error) {
			if err == nil {
				t.tm.dials.Add(ctx, 1, backendOption(t.backend))
			}
		},
		GotConn: func(info httptrace.GotConnInfo) {
			t.tm.conns.Add(ctx, 1, connOption(t.backend, info.Reused))
		},
		TLSHandshakeStart: func() { tlsStart = time.Now() },
		TLSHandshakeDone: func(_ tls.ConnectionState, err error) {
			if err == nil && !tlsStart.IsZero() {
				t.tm.tlsDuration.Record(ctx, time.Since(tlsStart).Seconds(), backendOption(t.backend))
			}
		},
		GotFirstResponseByte: func() {
			t.tm.ttfb.Record(ctx, time.Since(start).Seconds(), ttfbOption(t.backend, req.Method))
		},
	}
	return t.rt.RoundTrip(req.WithContext(httptrace.WithClientTrace(ctx, trace)))
}

// --- cached attribute options (hot path, same pattern as HttpMetricOption) ---

var backendAttrCache sync.Map

func backendOption(backend string) otelmetric.MeasurementOption {
	if v, ok := backendAttrCache.Load(backend); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(attribute.String("backend", backend)))
	backendAttrCache.Store(backend, opt)
	return opt
}

type connAttrKey struct {
	backend string
	reused  bool
}

var connAttrCache sync.Map

func connOption(backend string, reused bool) otelmetric.MeasurementOption {
	key := connAttrKey{backend, reused}
	if v, ok := connAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("backend", backend),
		attribute.Bool("reused", reused),
	))
	connAttrCache.Store(key, opt)
	return opt
}

type ttfbAttrKey struct {
	backend string
	method  string
}

var ttfbAttrCache sync.Map

func ttfbOption(backend, method string) otelmetric.MeasurementOption {
	key := ttfbAttrKey{backend, method}
	if v, ok := ttfbAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("backend", backend),
		attribute.String("method", method),
	))
	ttfbAttrCache.Store(key, opt)
	return opt
}
