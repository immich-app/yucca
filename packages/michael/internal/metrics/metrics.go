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
	"michael/internal/geoip"
	"michael/internal/version"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	otelmetric "go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
)

// otelResource identifies this process. Without service.instance.id replicas
// export identical series; merged counters read as resets and rate() reports ~1/replicas.
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
	client          *clientMetrics

	// Traffic counters, labelled by SOURCE NETWORK (not identity) — covers
	// requests that never authenticated; blobs.* answers "which customer".
	TrafficUploadedBytes   otelmetric.Int64Counter
	TrafficDownloadedBytes otelmetric.Int64Counter
	TrafficRequests        otelmetric.Int64Counter
}

// durationBuckets replaces the ms-sized SDK defaults (seconds recorded against
// them land every sub-5s request in the first bucket).
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

	// Duration includes streaming to the client; TTFB isolates michael+RGW latency.
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

	// RGW failures, split from generic HTTP errors so a backend-caused 500 wave
	// is directly alertable.
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

	// Token naming a cluster we don't front = routing/config mismatch with the
	// minting API; always rejected, so alertable rather than buried in 4xx.
	unknownCluster, err := meter.Int64Counter("storage.cluster.unknown",
		otelmetric.WithDescription("Requests rejected because the token named a storage cluster michael does not front"))
	if err != nil {
		return nil, fmt.Errorf("creating unknown_cluster counter: %w", err)
	}

	trafficUploadedBytes, err := meter.Int64Counter("traffic.uploaded_bytes",
		otelmetric.WithDescription("Total request-body bytes received, by source autonomous system"),
		otelmetric.WithUnit("By"))
	if err != nil {
		return nil, fmt.Errorf("creating traffic_uploaded_bytes counter: %w", err)
	}

	trafficDownloadedBytes, err := meter.Int64Counter("traffic.downloaded_bytes",
		otelmetric.WithDescription("Total response bytes sent, by source autonomous system"),
		otelmetric.WithUnit("By"))
	if err != nil {
		return nil, fmt.Errorf("creating traffic_downloaded_bytes counter: %w", err)
	}

	// Catches abuse floods of rejected requests that move almost no bytes.
	trafficRequests, err := meter.Int64Counter("traffic.requests",
		otelmetric.WithDescription("Total HTTP requests received, by source autonomous system"))
	if err != nil {
		return nil, fmt.Errorf("creating traffic_requests counter: %w", err)
	}

	client, err := newClientMetrics(meter)
	if err != nil {
		return nil, err
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
		client:          client,

		TrafficUploadedBytes:   trafficUploadedBytes,
		TrafficDownloadedBytes: trafficDownloadedBytes,
		TrafficRequests:        trafficRequests,
	}, nil
}

var clusterAttrCache sync.Map

// ClusterOption labels a measurement with a storage cluster code — charset-validated
// upstream, so bounded despite originating in a token claim.
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

type asnAttrKey struct{ asn, org string }

var asnAttrCache sync.Map

// ASNOption labels a measurement with the request's source network. Org is a
// function of the AS number (no extra series, nicer legends); address-level
// attribution is unbounded and stays on the access log line, never in labels.
func ASNOption(asn, org string) otelmetric.MeasurementOption {
	key := asnAttrKey{asn, org}
	if v, ok := asnAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("asn", asn),
		attribute.String("asOrg", org),
	))
	asnAttrCache.Store(key, opt)
	return opt
}

type storageErrAttrKey struct{ operation, blobType string }

var storageErrAttrCache sync.Map

// StorageErrorOption labels a backend failure by operation ("put", "get", …) and
// blob type. Deliberately low-cardinality (no per-user labels — identity is on the
// logged error line); this is a fleet-health/alerting signal.
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

// connectionLabel: connection *type* only, never instance id; legacy tokens
// without the claim report "unknown".
func connectionLabel(a auth.Auth) string {
	if a.Connection == "" {
		return "unknown"
	}
	return a.Connection
}

type blobAttrKey struct{ user, repository, connection, blobType string }

var blobAttrCache sync.Map

func BlobMetricOption(a auth.Auth, blobType string) otelmetric.MeasurementOption {
	key := blobAttrKey{a.User, a.Repository, connectionLabel(a), blobType}
	if v, ok := blobAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("customerId", a.User),
		attribute.String("repositoryId", a.Repository),
		attribute.String("connection", connectionLabel(a)),
		attribute.String("type", blobType),
	))
	blobAttrCache.Store(key, opt)
	return opt
}

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
	connection string
}

var httpUserAttrCache sync.Map

// HttpUserMetricOption is HttpMetricOption plus verified identity. Count/error
// counters only — histograms stay route-scoped to cap bucket-series cardinality.
func HttpUserMetricOption(method, route string, status int, user, repository, connection string) otelmetric.MeasurementOption {
	if user == "" {
		return HttpMetricOption(method, route, status)
	}
	key := httpUserAttrKey{method, route, status, user, repository, connection}
	if v, ok := httpUserAttrCache.Load(key); ok {
		return v.(otelmetric.MeasurementOption)
	}
	opt := otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("method", method),
		attribute.String("route", route),
		attribute.Int("status", status),
		attribute.String("customerId", user),
		attribute.String("repositoryId", repository),
		attribute.String("connection", connection),
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

type countingReader struct {
	reader io.Reader
	n      int64
}

func (cr *countingReader) Read(p []byte) (int, error) {
	n, err := cr.reader.Read(p)
	cr.n += int64(n)
	return n, err
}

type countingReadCloser struct {
	io.ReadCloser
	n int64
}

func (cr *countingReadCloser) Read(p []byte) (int, error) {
	n, err := cr.ReadCloser.Read(p)
	cr.n += int64(n)
	return n, err
}

type countingWriter struct {
	writer io.Writer
	n      int64
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	n, err := cw.writer.Write(p)
	cw.n += int64(n)
	return n, err
}

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

// TrafficMiddleware counts requests and bytes per source network. Wraps the
// WHOLE router — every outcome counts, incl. unauthenticated/rejected/errored.
// Must run after Middleware (*ResponseWriter) and geoip.Middleware (network resolved).
func TrafficMiddleware(m *Metrics) func(http.Handler) http.Handler {
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
			next.ServeHTTP(mrw, r)

			attrs := ASNOption(geoip.FromContext(r.Context()).Labels())
			m.TrafficRequests.Add(r.Context(), 1, attrs)
			if cr.n > 0 {
				m.TrafficUploadedBytes.Add(r.Context(), cr.n, attrs)
			}
			if downloaded := mrw.BytesWritten - beforeBytes; downloaded > 0 {
				m.TrafficDownloadedBytes.Add(r.Context(), downloaded, attrs)
			}
		})
	}
}

// authCapture carries the verified identity out to Middleware, which wraps the
// whole router (must see auth failures too) and so never gets the auth context.
type authCapture struct {
	user       string
	repository string
	connection string

	// Concurrency tracked from auth resolution (no identity before then; the
	// unattributed prefix is just a cache lookup).
	tracker *clientTracker
	state   *clientConcurrency
}

type authCaptureKey struct{}

// CaptureAuth copies the verified identity into Middleware's holder for
// per-user count/error labels. Mount after auth.Middleware.
func CaptureAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h, _ := r.Context().Value(authCaptureKey{}).(*authCapture); h != nil {
			a := auth.FromContext(r.Context())
			h.user = a.User
			h.repository = a.Repository
			h.connection = connectionLabel(a)
			if h.tracker != nil && h.user != "" {
				h.state = h.tracker.enter(clientAttrKey{h.user, h.repository, h.connection})
			}
		}
		next.ServeHTTP(w, r)
	})
}

func Middleware(m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := &ResponseWriter{ResponseWriter: w}
			capture := &authCapture{tracker: m.client.tracker}
			r = r.WithContext(context.WithValue(r.Context(), authCaptureKey{}, capture))

			// Deferred: a panic unwinds past us to chi's Recoverer; a request never
			// accounted out would pin concurrency >0 forever, blocking idle eviction.
			defer func() {
				if capture.state != nil {
					capture.state.exit(time.Now())
				}
			}()

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
			countAttrs := HttpUserMetricOption(r.Method, route, status, capture.user, capture.repository, capture.connection)

			m.RequestDuration.Record(r.Context(), duration, attrs)
			if !ww.FirstByte.IsZero() {
				m.RequestTTFB.Record(r.Context(), ww.FirstByte.Sub(start).Seconds(), attrs)
			}
			m.RequestCount.Add(r.Context(), 1, countAttrs)

			if capture.state != nil {
				m.client.seconds.Add(r.Context(), duration, capture.state.attrs)
				if !ww.FirstByte.IsZero() {
					m.client.ttfbSeconds.Add(r.Context(), ww.FirstByte.Sub(start).Seconds(), capture.state.attrs)
				}
			}

			if status >= 400 {
				m.RequestErrors.Add(r.Context(), 1, countAttrs)
			}
		})
	}
}
