package metrics

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"michael/internal/auth"
	"michael/internal/config"
	"michael/internal/version"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	otelmetric "go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
)

// otelResource identifies this process to the collector. Without
// service.instance.id every replica exports IDENTICAL series; the TSDB merges
// them into one, interleaved cumulative counters read as resets, and rate()
// reports ~1/replicas of the real traffic.
func otelResource() *sdkresource.Resource {
	host, _ := os.Hostname()
	res, err := sdkresource.Merge(sdkresource.Default(), sdkresource.NewSchemaless(
		attribute.String("service.name", "michael"),
		attribute.String("service.version", version.Version),
		attribute.String("service.instance.id", host),
	))
	if err != nil {
		return sdkresource.Default()
	}
	return res
}

type Metrics struct {
	RequestedBytes  otelmetric.Int64Counter
	DownloadedBytes otelmetric.Int64Counter
	UploadedBytes   otelmetric.Int64Counter
	StoredBytes     otelmetric.Int64UpDownCounter
	RequestDuration otelmetric.Float64Histogram
	RequestTTFB     otelmetric.Float64Histogram
	RequestCount    otelmetric.Int64Counter
	RequestErrors   otelmetric.Int64Counter
	StorageErrors   otelmetric.Int64Counter
	AuthCacheHits   otelmetric.Int64Counter
	AuthCacheMisses otelmetric.Int64Counter
	UnknownCluster  otelmetric.Int64Counter
}

// durationBuckets replaces the SDK default histogram boundaries, which are
// sized for milliseconds — recording seconds against them put every sub-5s
// request in the first bucket.
var durationBuckets = []float64{
	0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120,
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

	storedBytes, err := meter.Int64UpDownCounter("blobs.stored_bytes",
		otelmetric.WithDescription("Estimated net stored bytes (uploads minus deletions)"),
		otelmetric.WithUnit("By"))
	if err != nil {
		return nil, fmt.Errorf("creating stored_bytes counter: %w", err)
	}

	requestDuration, err := meter.Float64Histogram("http.server.request.duration",
		otelmetric.WithDescription("HTTP server request duration"),
		otelmetric.WithUnit("s"),
		otelmetric.WithExplicitBucketBoundaries(durationBuckets...))
	if err != nil {
		return nil, fmt.Errorf("creating request_duration histogram: %w", err)
	}

	// Duration includes streaming the body to the client, so for large blobs it
	// measures client throughput; TTFB isolates michael+RGW latency.
	requestTTFB, err := meter.Float64Histogram("http.server.request.ttfb",
		otelmetric.WithDescription("Time from request start to first response byte"),
		otelmetric.WithUnit("s"),
		otelmetric.WithExplicitBucketBoundaries(durationBuckets...))
	if err != nil {
		return nil, fmt.Errorf("creating request_ttfb histogram: %w", err)
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

	// Backend (RGW) storage-operation failures, split out from the generic HTTP
	// error counter so a gateway write-error spike is directly visible and
	// alertable — the signal that a client-facing 500 wave is the storage
	// backend, not michael or auth.
	storageErrors, err := meter.Int64Counter("storage.backend.errors",
		otelmetric.WithDescription("Backend S3 storage operation failures, by operation and blob type"))
	if err != nil {
		return nil, fmt.Errorf("creating storage_errors counter: %w", err)
	}

	authCacheHits, err := meter.Int64Counter("auth.cache.hits",
		otelmetric.WithDescription("JWT verifications served from the token cache"))
	if err != nil {
		return nil, fmt.Errorf("creating auth_cache_hits counter: %w", err)
	}

	authCacheMisses, err := meter.Int64Counter("auth.cache.misses",
		otelmetric.WithDescription("JWT verifications requiring a full signature check"))
	if err != nil {
		return nil, fmt.Errorf("creating auth_cache_misses counter: %w", err)
	}

	// A token naming a storage cluster this michael does not front means a
	// routing/config mismatch between the API that minted the token and this
	// deployment — every such request is rejected, so this must be alertable
	// rather than buried in the generic 4xx count.
	unknownCluster, err := meter.Int64Counter("storage.cluster.unknown",
		otelmetric.WithDescription("Requests rejected because the token named a storage cluster michael does not front"))
	if err != nil {
		return nil, fmt.Errorf("creating unknown_cluster counter: %w", err)
	}

	return &Metrics{
		RequestedBytes:  requestedBytes,
		DownloadedBytes: downloadedBytes,
		UploadedBytes:   uploadedBytes,
		StoredBytes:     storedBytes,
		RequestDuration: requestDuration,
		RequestTTFB:     requestTTFB,
		RequestCount:    requestCount,
		RequestErrors:   requestErrors,
		StorageErrors:   storageErrors,
		AuthCacheHits:   authCacheHits,
		AuthCacheMisses: authCacheMisses,
		UnknownCluster:  unknownCluster,
	}, nil
}

var clusterAttrCache sync.Map

// ClusterOption labels a measurement with a storage cluster code. Cluster codes
// are validated against a narrow charset before reaching here, so this stays
// bounded even though the value originates in a token claim.
func ClusterOption(code string) otelmetric.MeasurementOption {
	if v, ok := clusterAttrCache.Load(code); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("cluster", code),
	))
	clusterAttrCache.Store(code, opt)
	return opt
}

type storageErrAttrKey struct{ operation, blobType string }

var storageErrAttrCache sync.Map

// StorageErrorOption labels a backend storage failure by operation ("put",
// "get", …) and blob type. Deliberately low-cardinality (no per-user labels):
// this is a fleet-health/alerting signal, and the per-request identity is
// already on the logged error line.
func StorageErrorOption(operation, blobType string) otelmetric.MeasurementOption {
	key := storageErrAttrKey{operation, blobType}
	if v, ok := storageErrAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("operation", operation),
		attribute.String("type", blobType),
	))
	storageErrAttrCache.Store(key, opt)
	return opt
}

func SetupMeterProvider(cfg config.Config) (*sdkmetric.MeterProvider, error) {
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
		sdkmetric.WithResource(otelResource()),
		sdkmetric.WithReader(
			sdkmetric.NewPeriodicReader(exporter,
				sdkmetric.WithInterval(cfg.OTLPMetricsInterval),
			),
		),
	)

	return provider, nil
}

// --- Cached metric helpers (hot-path allocation avoidance) ---

type blobAttrKey struct{ user, repository, blobType string }

var blobAttrCache sync.Map

func BlobMetricOption(a auth.Auth, blobType string) otelmetric.MeasurementOption {
	key := blobAttrKey{a.User, a.Repository, blobType}
	if v, ok := blobAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("customerId", a.User),
		attribute.String("repositoryId", a.Repository),
		attribute.String("type", blobType),
	))
	blobAttrCache.Store(key, opt)
	return opt
}

// BlobType returns the blob-category metric label for a request: the {type}
// route param ("data", "index", ...), "config" for repository config
// operations, "repo" for repository-level create/delete.
func BlobType(r *http.Request) string {
	if t := chi.URLParam(r, "type"); t != "" {
		return t
	}
	if strings.HasSuffix(r.URL.Path, "/config") {
		return "config"
	}
	return "repo"
}

type httpAttrKey struct {
	method string
	route  string
	status int
}

var httpAttrCache sync.Map

func HttpMetricOption(method, route string, status int) otelmetric.MeasurementOption {
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

type httpUserAttrKey struct {
	method     string
	route      string
	status     int
	user       string
	repository string
}

var httpUserAttrCache sync.Map

// HttpUserMetricOption is HttpMetricOption plus the request's verified
// identity. Used for the request count/error counters only — the duration and
// TTFB histograms stay route-scoped to keep bucket-series cardinality down.
func HttpUserMetricOption(method, route string, status int, user, repository string) otelmetric.MeasurementOption {
	if user == "" {
		return HttpMetricOption(method, route, status)
	}
	key := httpUserAttrKey{method, route, status, user, repository}
	if v, ok := httpUserAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("method", method),
		attribute.String("route", route),
		attribute.Int("status", status),
		attribute.String("customerId", user),
		attribute.String("repositoryId", repository),
	))
	httpUserAttrCache.Store(key, opt)
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

// ResponseWriter wraps http.ResponseWriter to count bytes written, track
// status, and stamp when the response started (for TTFB).
type ResponseWriter struct {
	http.ResponseWriter
	BytesWritten int64
	Status       int
	FirstByte    time.Time
}

func (w *ResponseWriter) markStart() {
	if w.FirstByte.IsZero() {
		w.FirstByte = time.Now()
	}
}

func (w *ResponseWriter) WriteHeader(code int) {
	w.markStart()
	w.Status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *ResponseWriter) Write(p []byte) (int, error) {
	w.markStart()
	if w.Status == 0 {
		w.Status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(p)
	w.BytesWritten += int64(n)
	return n, err
}

// ReadFrom implements io.ReaderFrom to preserve sendfile/splice zero-copy
// optimization when the underlying ResponseWriter supports it.
func (w *ResponseWriter) ReadFrom(r io.Reader) (int64, error) {
	w.markStart()
	if w.Status == 0 {
		w.Status = http.StatusOK
	}
	if rf, ok := w.ResponseWriter.(io.ReaderFrom); ok {
		n, err := rf.ReadFrom(r)
		w.BytesWritten += n
		return n, err
	}
	// Fallback: copy through Write so bytes are still counted.
	// Wrap w in a plain io.Writer to prevent io.Copy from calling ReadFrom again.
	n, err := io.Copy(struct{ io.Writer }{w}, r)
	return n, err
}

func (w *ResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// BlobMiddleware counts uploaded/downloaded bytes.
// Must run after auth.Middleware so auth context is available, and after
// Middleware so w is already a *ResponseWriter.
func BlobMiddleware(m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cr := &countingReadCloser{ReadCloser: r.Body}
			r.Body = cr

			mrw, ok := w.(*ResponseWriter)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			beforeBytes := mrw.BytesWritten
			next.ServeHTTP(w, r)

			status := mrw.Status
			if status == 0 {
				status = http.StatusOK
			}
			if status < 200 || status >= 300 {
				return
			}

			a := auth.FromContext(r.Context())
			attrs := BlobMetricOption(a, BlobType(r))

			if cr.n > 0 {
				m.UploadedBytes.Add(r.Context(), cr.n, attrs)
			}
			if downloaded := mrw.BytesWritten - beforeBytes; downloaded > 0 {
				m.DownloadedBytes.Add(r.Context(), downloaded, attrs)
			}
		})
	}
}

// authCapture carries the verified identity from the authed route group out to
// Middleware, which wraps the whole router (it must observe auth failures too)
// and therefore never sees the auth context on its own request.
type authCapture struct {
	user       string
	repository string
}

type authCaptureKey struct{}

// CaptureAuth copies the request's verified identity into the holder injected
// by Middleware so request count/error metrics can be labeled per user. Must
// be mounted after auth.Middleware.
func CaptureAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h, _ := r.Context().Value(authCaptureKey{}).(*authCapture); h != nil {
			a := auth.FromContext(r.Context())
			h.user = a.User
			h.repository = a.Repository
		}
		next.ServeHTTP(w, r)
	})
}

// Middleware records HTTP request metrics.
func Middleware(m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := &ResponseWriter{ResponseWriter: w}
			capture := &authCapture{}
			r = r.WithContext(context.WithValue(r.Context(), authCaptureKey{}, capture))

			next.ServeHTTP(ww, r)

			duration := time.Since(start).Seconds()
			status := ww.Status
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

			attrs := HttpMetricOption(r.Method, route, status)
			countAttrs := HttpUserMetricOption(r.Method, route, status, capture.user, capture.repository)

			m.RequestDuration.Record(r.Context(), duration, attrs)
			if !ww.FirstByte.IsZero() {
				m.RequestTTFB.Record(r.Context(), ww.FirstByte.Sub(start).Seconds(), attrs)
			}
			m.RequestCount.Add(r.Context(), 1, countAttrs)

			if status >= 400 {
				m.RequestErrors.Add(r.Context(), 1, countAttrs)
			}
		})
	}
}
