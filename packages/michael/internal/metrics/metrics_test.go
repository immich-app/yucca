package metrics

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestBlobType(t *testing.T) {
	cases := []struct {
		method, path, want string
	}{
		{"POST", "/repo-1/data/" + strings.Repeat("a", 64), "data"},
		{"GET", "/repo-1/locks/", "locks"},
		{"POST", "/repo-1/config", "config"},
		{"POST", "/repo-1/", "repo"},
	}

	r := chi.NewRouter()
	var got string
	capture := func(w http.ResponseWriter, r *http.Request) { got = BlobType(r) }
	r.Post("/{path}/", capture)
	r.Post("/{path}/config", capture)
	r.Get("/{path}/{type}/", capture)
	r.Post("/{path}/{type}/{name}", capture)

	for _, c := range cases {
		got = ""
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(c.method, c.path, nil))
		if got != c.want {
			t.Fatalf("%s %s: expected blob type %q, got %q", c.method, c.path, c.want, got)
		}
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

func TestBlobMetricOptionCacheHit(t *testing.T) {
	a := auth.Auth{User: "u1", Repository: "r1"}
	opt1 := BlobMetricOption(a, "data")
	opt2 := BlobMetricOption(a, "data")
	// Same pointer means the cache returned the same object.
	if opt1 != opt2 {
		t.Fatal("expected cached BlobMetricOption to return the same object")
	}
}

func TestBlobMetricOptionDifferentKeys(t *testing.T) {
	a := BlobMetricOption(auth.Auth{User: "u1", Repository: "r1"}, "data")
	b := BlobMetricOption(auth.Auth{User: "u2", Repository: "r2"}, "data")
	if a == b {
		t.Fatal("different auth keys should produce different options")
	}
	c := BlobMetricOption(auth.Auth{User: "u1", Repository: "r1"}, "index")
	if a == c {
		t.Fatal("different blob types should produce different options")
	}
}

func TestHttpUserMetricOption(t *testing.T) {
	// Empty user delegates to the route-scoped option.
	anon := HttpUserMetricOption("GET", "/foo", 200, "", "", "immich")
	if anon != HttpMetricOption("GET", "/foo", 200) {
		t.Fatal("expected empty user to reuse the route-scoped option")
	}

	a := HttpUserMetricOption("GET", "/foo", 200, "u1", "r1", "immich")
	if a == anon {
		t.Fatal("expected per-user option to differ from the route-scoped one")
	}
	if a != HttpUserMetricOption("GET", "/foo", 200, "u1", "r1", "immich") {
		t.Fatal("expected cached HttpUserMetricOption to return the same object")
	}
	if a == HttpUserMetricOption("GET", "/foo", 200, "u2", "r2", "immich") {
		t.Fatal("different users should produce different options")
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

func TestBlobMetricOptionConcurrency(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			BlobMetricOption(auth.Auth{User: "u1", Repository: "r1"}, "data")
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

func TestBlobMetricOptionConnectionInCacheKey(t *testing.T) {
	// Same user+repo but different connection types must not share a cache entry.
	a := BlobMetricOption(auth.Auth{User: "u1", Repository: "r1", Connection: "immich"}, "data")
	b := BlobMetricOption(auth.Auth{User: "u1", Repository: "r1", Connection: "restic"}, "data")
	if a == b {
		t.Fatal("different connections should produce different options")
	}
}

func TestConnectionLabelUnknownForLegacyTokens(t *testing.T) {
	if got := connectionLabel(auth.Auth{}); got != "unknown" {
		t.Fatalf("expected unknown, got %s", got)
	}
	if got := connectionLabel(auth.Auth{Connection: "restic"}); got != "restic" {
		t.Fatalf("expected restic, got %s", got)
	}
}
