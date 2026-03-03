package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	otelmetric "go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

type Metrics struct {
	RequestedBytes  otelmetric.Int64Counter
	DownloadedBytes otelmetric.Int64Counter
	UploadedBytes   otelmetric.Int64Counter
	RequestDuration otelmetric.Float64Histogram
	RequestCount    otelmetric.Int64Counter
	RequestErrors   otelmetric.Int64Counter
}

func NewMetrics(meter otelmetric.Meter) (*Metrics, error) {
	requestedBytes, err := meter.Int64Counter("blobs.requested_bytes",
		otelmetric.WithDescription("Total no. of blob bytes requested for download"))
	if err != nil {
		return nil, fmt.Errorf("creating requested_bytes counter: %w", err)
	}

	downloadedBytes, err := meter.Int64Counter("blobs.downloaded_bytes",
		otelmetric.WithDescription("Total no. of blob bytes downloaded"))
	if err != nil {
		return nil, fmt.Errorf("creating downloaded_bytes counter: %w", err)
	}

	uploadedBytes, err := meter.Int64Counter("blobs.uploaded_bytes",
		otelmetric.WithDescription("Total no. of blob bytes uploaded"))
	if err != nil {
		return nil, fmt.Errorf("creating uploaded_bytes counter: %w", err)
	}

	requestDuration, err := meter.Float64Histogram("http.server.request.duration",
		otelmetric.WithDescription("HTTP server request duration"),
		otelmetric.WithUnit("s"))
	if err != nil {
		return nil, fmt.Errorf("creating request_duration histogram: %w", err)
	}

	requestCount, err := meter.Int64Counter("http.server.request.count",
		otelmetric.WithDescription("Total number of HTTP requests"))
	if err != nil {
		return nil, fmt.Errorf("creating request_count counter: %w", err)
	}

	requestErrors, err := meter.Int64Counter("http.server.request.errors",
		otelmetric.WithDescription("Total number of HTTP request errors (4xx/5xx)"))
	if err != nil {
		return nil, fmt.Errorf("creating request_errors counter: %w", err)
	}

	return &Metrics{
		RequestedBytes:  requestedBytes,
		DownloadedBytes: downloadedBytes,
		UploadedBytes:   uploadedBytes,
		RequestDuration: requestDuration,
		RequestCount:    requestCount,
		RequestErrors:   requestErrors,
	}, nil
}

func SetupMeterProvider(cfg Config) (*sdkmetric.MeterProvider, error) {
	ctx := context.Background()

	opts := []otlpmetrichttp.Option{
		otlpmetrichttp.WithEndpoint(cfg.OTLPMetricsEndpoint),
		otlpmetrichttp.WithInsecure(),
	}
	if cfg.OTLPMetricsURLPath != "" {
		opts = append(opts, otlpmetrichttp.WithURLPath(cfg.OTLPMetricsURLPath))
	}

	exporter, err := otlpmetrichttp.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("creating OTLP metric exporter: %w", err)
	}

	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(
			sdkmetric.NewPeriodicReader(exporter,
				sdkmetric.WithInterval(cfg.OTLPMetricsInterval),
			),
		),
	)

	return provider, nil
}

func MetricAttrs(auth Auth) attribute.Set {
	return attribute.NewSet(
		attribute.String("customerId", auth.User),
		attribute.String("repositoryId", auth.Repository),
	)
}

// --- Cached metric helpers (hot-path allocation avoidance) ---

type authAttrKey struct{ user, repository string }

var authAttrCache sync.Map

func authMetricOption(auth Auth) otelmetric.MeasurementOption {
	key := authAttrKey{auth.User, auth.Repository}
	if v, ok := authAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("customerId", auth.User),
		attribute.String("repositoryId", auth.Repository),
	))
	authAttrCache.Store(key, opt)
	return opt
}

type httpAttrKey struct {
	method string
	route  string
	status int
}

var httpAttrCache sync.Map

func httpMetricOption(method, route string, status int) otelmetric.MeasurementOption {
	key := httpAttrKey{method, route, status}
	if v, ok := httpAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("method", method),
		attribute.String("route", route),
		attribute.Int("status", status),
	))
	httpAttrCache.Store(key, opt)
	return opt
}

var routePatternCache sync.Map

func cachedRoutePattern(rctx *chi.Context) string {
	patterns := rctx.RoutePatterns
	key := strings.Join(patterns, "\x00")
	if v, ok := routePatternCache.Load(key); ok {
		return v.(string)
	}
	result := rctx.RoutePattern()
	routePatternCache.Store(key, result)
	return result
}

// countingReader wraps an io.Reader and counts bytes read.
type countingReader struct {
	reader io.Reader
	n      int64
}

func (cr *countingReader) Read(p []byte) (int, error) {
	n, err := cr.reader.Read(p)
	cr.n += int64(n)
	return n, err
}

// countingReadCloser wraps an io.ReadCloser and counts bytes read.
type countingReadCloser struct {
	io.ReadCloser
	n int64
}

func (cr *countingReadCloser) Read(p []byte) (int, error) {
	n, err := cr.ReadCloser.Read(p)
	cr.n += int64(n)
	return n, err
}

// countingWriter wraps an io.Writer and counts bytes written.
type countingWriter struct {
	writer io.Writer
	n      int64
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	n, err := cw.writer.Write(p)
	cw.n += int64(n)
	return n, err
}

// metricsResponseWriter wraps http.ResponseWriter to count bytes written and track status.
type metricsResponseWriter struct {
	http.ResponseWriter
	bytesWritten int64
	status       int
}

func (w *metricsResponseWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *metricsResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(p)
	w.bytesWritten += int64(n)
	return n, err
}

// ReadFrom implements io.ReaderFrom to preserve sendfile/splice zero-copy
// optimization when the underlying ResponseWriter supports it.
func (w *metricsResponseWriter) ReadFrom(r io.Reader) (int64, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if rf, ok := w.ResponseWriter.(io.ReaderFrom); ok {
		n, err := rf.ReadFrom(r)
		w.bytesWritten += n
		return n, err
	}
	// Fallback: copy through Write so bytes are still counted.
	// Wrap w in a plain io.Writer to prevent io.Copy from calling ReadFrom again.
	n, err := io.Copy(struct{ io.Writer }{w}, r)
	return n, err
}

func (w *metricsResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// blobMetricsMiddleware counts uploaded/downloaded bytes.
// Must run after authMiddleware so auth context is available, and after
// metricsMiddleware so w is already a *metricsResponseWriter.
func blobMetricsMiddleware(m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cr := &countingReadCloser{ReadCloser: r.Body}
			r.Body = cr

			mrw, ok := w.(*metricsResponseWriter)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			beforeBytes := mrw.bytesWritten
			next.ServeHTTP(w, r)

			status := mrw.status
			if status == 0 {
				status = http.StatusOK
			}
			if status < 200 || status >= 300 {
				return
			}

			auth := authFromContext(r.Context())
			attrs := authMetricOption(auth)

			if cr.n > 0 {
				m.UploadedBytes.Add(r.Context(), cr.n, attrs)
			}
			if downloaded := mrw.bytesWritten - beforeBytes; downloaded > 0 {
				m.DownloadedBytes.Add(r.Context(), downloaded, attrs)
			}
		})
	}
}

// metricsMiddleware records HTTP request metrics.
func metricsMiddleware(m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := &metricsResponseWriter{ResponseWriter: w}

			next.ServeHTTP(ww, r)

			duration := time.Since(start).Seconds()
			status := ww.status
			if status == 0 {
				status = http.StatusOK
			}

			rctx := chi.RouteContext(r.Context())
			route := "unknown"
			if rctx != nil {
				if p := cachedRoutePattern(rctx); p != "" {
					route = p
				}
			}

			attrs := httpMetricOption(r.Method, route, status)

			m.RequestDuration.Record(r.Context(), duration, attrs)
			m.RequestCount.Add(r.Context(), 1, attrs)

			if status >= 400 {
				m.RequestErrors.Add(r.Context(), 1, attrs)
			}
		})
	}
}
