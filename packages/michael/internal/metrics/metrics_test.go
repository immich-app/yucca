package metrics

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"michael/internal/auth"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/metric/noop"
)

func TestCountingReader(t *testing.T) {
	data := []byte("hello world")
	cr := &countingReader{reader: bytes.NewReader(data)}

	buf := make([]byte, 5)
	n, err := cr.Read(buf)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 5 {
		t.Fatalf("expected 5 bytes, got %d", n)
	}
	if cr.n != 5 {
		t.Fatalf("expected counter at 5, got %d", cr.n)
	}

	// Read remaining bytes into a larger buffer
	buf2 := make([]byte, 32)
	n, err = cr.Read(buf2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 6 {
		t.Fatalf("expected 6 bytes, got %d", n)
	}
	if cr.n != 11 {
		t.Fatalf("expected counter at 11, got %d", cr.n)
	}

	_, err = cr.Read(buf2)
	if err != io.EOF {
		t.Fatalf("expected EOF, got %v", err)
	}
	if cr.n != 11 {
		t.Fatalf("expected counter still at 11, got %d", cr.n)
	}
}

func TestCountingWriter(t *testing.T) {
	var buf bytes.Buffer
	cw := &countingWriter{writer: &buf}

	n, err := cw.Write([]byte("hello"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 5 {
		t.Fatalf("expected 5 bytes written, got %d", n)
	}
	if cw.n != 5 {
		t.Fatalf("expected counter at 5, got %d", cw.n)
	}

	n, err = cw.Write([]byte(" world"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 6 {
		t.Fatalf("expected 6 bytes written, got %d", n)
	}
	if cw.n != 11 {
		t.Fatalf("expected counter at 11, got %d", cw.n)
	}

	if buf.String() != "hello world" {
		t.Fatalf("expected 'hello world', got %q", buf.String())
	}
}

func TestMetricAttrs(t *testing.T) {
	a := auth.Auth{
		User:       "customer-123",
		Repository: "repo-456",
	}

	attrs := MetricAttrs(a)

	customerID, found := attrs.Value("customerId")
	if !found {
		t.Fatal("expected customerId attribute")
	}
	if customerID.AsString() != "customer-123" {
		t.Fatalf("expected customer-123, got %s", customerID.AsString())
	}

	repoID, found := attrs.Value("repositoryId")
	if !found {
		t.Fatal("expected repositoryId attribute")
	}
	if repoID.AsString() != "repo-456" {
		t.Fatalf("expected repo-456, got %s", repoID.AsString())
	}

	connection, found := attrs.Value("connection")
	if !found {
		t.Fatal("expected connection attribute")
	}
	if connection.AsString() != "unknown" {
		t.Fatalf("expected unknown connection for legacy auth, got %s", connection.AsString())
	}

	// Should have exactly 3 attributes
	if attrs.Len() != 3 {
		t.Fatalf("expected 3 attributes, got %d", attrs.Len())
	}
}

func TestMetricAttrsConnection(t *testing.T) {
	attrs := MetricAttrs(auth.Auth{User: "u", Repository: "r", Connection: "restic"})
	connection, _ := attrs.Value("connection")
	if connection.AsString() != "restic" {
		t.Fatalf("expected restic, got %s", connection.AsString())
	}
}

func TestMetricAttrsEquivalence(t *testing.T) {
	a := auth.Auth{User: "u1", Repository: "r1"}
	x := MetricAttrs(a)
	y := MetricAttrs(a)
	if !x.Equals(&y) {
		t.Fatal("expected equivalent attribute sets")
	}
}

func TestNewMetricsWithNoopMeter(t *testing.T) {
	meter := noop.NewMeterProvider().Meter("test")
	m, err := NewMetrics(meter)
	if err != nil {
		t.Fatalf("unexpected error creating metrics with noop meter: %v", err)
	}
	if m == nil {
		t.Fatal("expected non-nil Metrics")
	}
	if m.RequestedBytes == nil {
		t.Fatal("expected non-nil RequestedBytes")
	}
	if m.DownloadedBytes == nil {
		t.Fatal("expected non-nil DownloadedBytes")
	}
	if m.UploadedBytes == nil {
		t.Fatal("expected non-nil UploadedBytes")
	}
	if m.RequestDuration == nil {
		t.Fatal("expected non-nil RequestDuration")
	}
	if m.RequestCount == nil {
		t.Fatal("expected non-nil RequestCount")
	}
	if m.RequestErrors == nil {
		t.Fatal("expected non-nil RequestErrors")
	}
}

func TestCountingReaderEmpty(t *testing.T) {
	cr := &countingReader{reader: bytes.NewReader(nil)}
	buf := make([]byte, 10)
	_, err := cr.Read(buf)
	if err != io.EOF {
		t.Fatalf("expected EOF, got %v", err)
	}
	if cr.n != 0 {
		t.Fatalf("expected counter at 0, got %d", cr.n)
	}
}

func TestCountingWriterPreservesErrors(t *testing.T) {
	ew := &errWriter{}
	cw := &countingWriter{writer: ew}
	_, err := cw.Write([]byte("data"))
	if err == nil {
		t.Fatal("expected error from errWriter")
	}
	if cw.n != 0 {
		t.Fatalf("expected counter at 0 on error, got %d", cw.n)
	}
}

func TestCountingReadCloser(t *testing.T) {
	data := []byte("hello world")
	rc := io.NopCloser(bytes.NewReader(data))
	cr := &countingReadCloser{ReadCloser: rc}

	buf := make([]byte, 32)
	n, err := cr.Read(buf)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 11 {
		t.Fatalf("expected 11 bytes, got %d", n)
	}
	if cr.n != 11 {
		t.Fatalf("expected counter at 11, got %d", cr.n)
	}

	if err := cr.Close(); err != nil {
		t.Fatalf("unexpected close error: %v", err)
	}
}

func TestResponseWriter(t *testing.T) {
	rec := &fakeResponseWriter{header: make(map[string][]string)}
	mrw := &ResponseWriter{ResponseWriter: rec}

	mrw.WriteHeader(201)
	if mrw.Status != 201 {
		t.Fatalf("expected status 201, got %d", mrw.Status)
	}

	n, err := mrw.Write([]byte("hello"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 5 {
		t.Fatalf("expected 5 bytes, got %d", n)
	}
	if mrw.BytesWritten != 5 {
		t.Fatalf("expected 5 bytes written, got %d", mrw.BytesWritten)
	}

	_, err = mrw.Write([]byte(" world"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mrw.BytesWritten != 11 {
		t.Fatalf("expected 11 bytes written, got %d", mrw.BytesWritten)
	}

	if mrw.Unwrap() != http.ResponseWriter(rec) {
		t.Fatal("Unwrap should return underlying ResponseWriter")
	}
}

func TestResponseWriterDefaultStatus(t *testing.T) {
	rec := &fakeResponseWriter{header: make(map[string][]string)}
	mrw := &ResponseWriter{ResponseWriter: rec}

	// Write without explicit WriteHeader should default to 200
	if _, err := mrw.Write([]byte("data")); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mrw.Status != 200 {
		t.Fatalf("expected default status 200, got %d", mrw.Status)
	}
}

func TestResponseWriterReadFromDelegates(t *testing.T) {
	rfw := &readFromResponseWriter{header: make(map[string][]string)}
	mrw := &ResponseWriter{ResponseWriter: rfw}

	src := bytes.NewReader([]byte("hello world"))
	n, err := mrw.ReadFrom(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 11 {
		t.Fatalf("expected 11 bytes, got %d", n)
	}
	if mrw.BytesWritten != 11 {
		t.Fatalf("expected 11 bytes counted, got %d", mrw.BytesWritten)
	}
	if !rfw.readFromCalled {
		t.Fatal("expected ReadFrom to be delegated to underlying writer")
	}
}

func TestResponseWriterReadFromFallback(t *testing.T) {
	// fakeResponseWriter does NOT implement io.ReaderFrom, so fallback path is used
	rec := &fakeResponseWriter{header: make(map[string][]string)}
	mrw := &ResponseWriter{ResponseWriter: rec}

	src := bytes.NewReader([]byte("hello"))
	n, err := mrw.ReadFrom(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 5 {
		t.Fatalf("expected 5 bytes, got %d", n)
	}
	if mrw.BytesWritten != 5 {
		t.Fatalf("expected 5 bytes counted, got %d", mrw.BytesWritten)
	}
	if rec.buf.String() != "hello" {
		t.Fatalf("expected 'hello', got %q", rec.buf.String())
	}
}

type errWriter struct{}

func (ew *errWriter) Write(p []byte) (int, error) {
	return 0, io.ErrClosedPipe
}

// fakeResponseWriter is a minimal http.ResponseWriter for testing.
type fakeResponseWriter struct {
	header map[string][]string
	buf    bytes.Buffer
}

func (f *fakeResponseWriter) Header() http.Header         { return http.Header(f.header) }
func (f *fakeResponseWriter) Write(p []byte) (int, error) { return f.buf.Write(p) }
func (f *fakeResponseWriter) WriteHeader(int)             {}

// readFromResponseWriter implements both http.ResponseWriter and io.ReaderFrom.
type readFromResponseWriter struct {
	header         map[string][]string
	buf            bytes.Buffer
	readFromCalled bool
}

func (f *readFromResponseWriter) Header() http.Header         { return http.Header(f.header) }
func (f *readFromResponseWriter) Write(p []byte) (int, error) { return f.buf.Write(p) }
func (f *readFromResponseWriter) WriteHeader(int)             {}
func (f *readFromResponseWriter) ReadFrom(r io.Reader) (int64, error) {
	f.readFromCalled = true
	return io.Copy(&f.buf, r)
}

func TestAuthMetricOptionCacheHit(t *testing.T) {
	a := auth.Auth{User: "u1", Repository: "r1"}
	opt1 := AuthMetricOption(a)
	opt2 := AuthMetricOption(a)
	// Same pointer means the cache returned the same object.
	if opt1 != opt2 {
		t.Fatal("expected cached AuthMetricOption to return the same object")
	}
}

func TestAuthMetricOptionDifferentKeys(t *testing.T) {
	a := AuthMetricOption(auth.Auth{User: "u1", Repository: "r1"})
	b := AuthMetricOption(auth.Auth{User: "u2", Repository: "r2"})
	if a == b {
		t.Fatal("different auth keys should produce different options")
	}
}

func TestAuthMetricOptionConnectionInCacheKey(t *testing.T) {
	// Same user+repo but different connection must not share a cache entry.
	a := AuthMetricOption(auth.Auth{User: "u1", Repository: "r1", Connection: "immich"})
	b := AuthMetricOption(auth.Auth{User: "u1", Repository: "r1", Connection: "restic"})
	if a == b {
		t.Fatal("different connections should produce different options")
	}
}

func TestHttpMetricOptionCacheHit(t *testing.T) {
	opt1 := HttpMetricOption("GET", "/foo", 200)
	opt2 := HttpMetricOption("GET", "/foo", 200)
	if opt1 != opt2 {
		t.Fatal("expected cached HttpMetricOption to return the same object")
	}
}

func TestHttpMetricOptionDifferentKeys(t *testing.T) {
	a := HttpMetricOption("GET", "/foo", 200)
	b := HttpMetricOption("POST", "/foo", 201)
	if a == b {
		t.Fatal("different HTTP keys should produce different options")
	}
}

func TestCachedRoutePattern(t *testing.T) {
	// Build a chi router with a known route, then fire a request through it
	// so that RoutePatterns is populated.
	r := chi.NewRouter()
	var captured string
	r.Get("/api/{id}", func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		captured = cachedRoutePattern(rctx)
	})

	req := httptest.NewRequest("GET", "/api/42", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if captured == "" {
		t.Fatal("expected non-empty cached route pattern")
	}

	// Fire again — should hit cache and return same string.
	var captured2 string
	r2 := chi.NewRouter()
	r2.Get("/api/{id}", func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		captured2 = cachedRoutePattern(rctx)
	})
	req2 := httptest.NewRequest("GET", "/api/99", nil)
	rec2 := httptest.NewRecorder()
	r2.ServeHTTP(rec2, req2)

	if captured != captured2 {
		t.Fatalf("expected same cached pattern, got %q and %q", captured, captured2)
	}
}

func TestAuthMetricOptionConcurrency(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			AuthMetricOption(auth.Auth{User: "u1", Repository: "r1"})
		}()
	}
	wg.Wait()
}

func TestBlobMiddlewareUnwraps(t *testing.T) {
	meter := noop.NewMeterProvider().Meter("test")
	m, err := NewMetrics(meter)
	if err != nil {
		t.Fatal(err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The writer passed through should be the outer ResponseWriter,
		// not a second wrapper.
		if _, ok := w.(*ResponseWriter); !ok {
			t.Error("expected w to be *ResponseWriter, not a new wrapper")
		}
		if _, err := w.Write([]byte("hello")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	handler := BlobMiddleware(m)(inner)

	// Wrap in a ResponseWriter (simulating Middleware).
	rec := httptest.NewRecorder()
	mrw := &ResponseWriter{ResponseWriter: rec}

	req := httptest.NewRequest("GET", "/test", nil)
	ctx := auth.NewContext(req.Context(), auth.Auth{User: "u1", Repository: "r1"})
	req = req.WithContext(ctx)

	handler.ServeHTTP(mrw, req)

	if mrw.BytesWritten != 5 {
		t.Fatalf("expected 5 bytes written, got %d", mrw.BytesWritten)
	}
}
