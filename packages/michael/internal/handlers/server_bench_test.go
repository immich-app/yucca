package handlers

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"michael/internal/geoip"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/hlog"
	"github.com/rs/zerolog/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

// One question: what does source-network labelling cost per request? Same
// router + instrumented meter throughout; only ResolveClient varies (the switch
// mounting geoip.Middleware + metrics.TrafficMiddleware). The three-network
// fixture is optimistic; export MICHAEL_BENCH_ASN_DB=/path/to/dbip-asn-lite.mmdb
// to measure a real database.

// benchServer builds a server over an instrumented meter (NOT noop — the
// aggregation work is part of what we are measuring) serving a fixed blob.
func benchServer(b *testing.B, blob []byte, resolve func(*http.Request) geoip.Client) *Server {
	b.Helper()

	m, err := metrics.NewMetrics(sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewManualReader()),
	).Meter("bench"))
	if err != nil {
		b.Fatalf("NewMetrics: %v", err)
	}

	store := &mockStorage{
		getObjectFn: func(_ context.Context, _, _, _ string) (*storage.S3Object, error) {
			return &storage.S3Object{
				Body:          io.NopCloser(bytes.NewReader(blob)),
				ContentLength: int64(len(blob)),
				ContentType:   "application/octet-stream",
			}, nil
		},
	}

	srv := NewServer(store, testPublicKey, m)
	srv.ResolveClient = resolve
	return srv
}

// benchRequest builds one reusable authed blob GET, signed once — michael
// caches verified tokens; re-signing per iteration would benchmark ECDSA.
func benchRequest(b *testing.B) *http.Request {
	b.Helper()
	token := makeJWTForBench(b, jwt.MapClaims{
		"user":       testUser,
		"repository": testRepository,
		"writeOnce":  false,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	})
	r := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/data/"+testBlobName, nil)
	r.Header.Set("Authorization", makeBasicAuth(token))
	// The shape envoy actually delivers: the client's own header plus the
	// address the gateway observed, appended.
	r.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.7")
	r.RemoteAddr = "10.40.10.11:44321"
	return r
}

func makeJWTForBench(b *testing.B, claims jwt.MapClaims) string {
	b.Helper()
	signed, err := jwt.NewWithClaims(jwt.SigningMethodES256, claims).SignedString(testPrivateKey)
	if err != nil {
		b.Fatalf("failed to sign JWT: %v", err)
	}
	return signed
}

func benchResolver(b *testing.B) func(*http.Request) geoip.Client {
	b.Helper()
	path := os.Getenv("MICHAEL_BENCH_ASN_DB")
	if path == "" {
		path = "../geoip/testdata/asn-test.mmdb"
	}
	db, err := geoip.Open(path)
	if err != nil {
		b.Fatalf("geoip.Open(%q): %v", path, err)
	}
	b.Cleanup(func() {
		if err := db.Close(); err != nil {
			b.Errorf("Close: %v", err)
		}
	})
	return func(r *http.Request) geoip.Client { return db.Resolve(r, "X-Forwarded-For") }
}

// blobSizes brackets the workload: 16MiB = this deployment's restic pack size
// (yucca-api DEFAULT_CONFIG restic_pack_size_mib, yuctl --pack-size default);
// 1KiB = worst case for RELATIVE overhead (nothing to amortize over).
var blobSizes = []struct {
	name string
	size int
}{
	{"1KiB", 1 << 10},
	{"16MiB", 16 << 20},
}

func BenchmarkServeBlob(b *testing.B) {
	// Mute the access log (info in prod): a line per iteration would measure
	// the logger, not the handler.
	silenceLogs(b)

	for _, size := range blobSizes {
		blob := bytes.Repeat([]byte("x"), size.size)
		for _, variant := range []struct {
			name    string
			resolve func(*testing.B) func(*http.Request) geoip.Client
		}{
			{"asn_off", func(*testing.B) func(*http.Request) geoip.Client { return nil }},
			{"asn_on", benchResolver},
		} {
			b.Run(size.name+"/"+variant.name, func(b *testing.B) {
				srv := benchServer(b, blob, variant.resolve(b))
				handler := srv.Handler()
				req := benchRequest(b)

				b.SetBytes(int64(size.size))
				b.ReportAllocs()
				for b.Loop() {
					rec := httptest.NewRecorder()
					handler.ServeHTTP(rec, req)
					if rec.Code != http.StatusOK {
						b.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
					}
				}
			})
		}
	}
}

// Production serves many connections at once; a per-request lookup that
// contends would show up here and not in the serial benchmark.
func BenchmarkServeBlobParallel(b *testing.B) {
	silenceLogs(b)

	blob := bytes.Repeat([]byte("x"), 1<<10)
	for _, variant := range []struct {
		name    string
		resolve func(*testing.B) func(*http.Request) geoip.Client
	}{
		{"asn_off", func(*testing.B) func(*http.Request) geoip.Client { return nil }},
		{"asn_on", benchResolver},
	} {
		b.Run(variant.name, func(b *testing.B) {
			srv := benchServer(b, blob, variant.resolve(b))
			handler := srv.Handler()
			req := benchRequest(b)

			b.ReportAllocs()
			b.RunParallel(func(pb *testing.PB) {
				for pb.Next() {
					rec := httptest.NewRecorder()
					handler.ServeHTTP(rec, req)
					if rec.Code != http.StatusOK {
						b.Fatalf("expected 200, got %d", rec.Code)
					}
				}
			})
		})
	}
}

// BenchmarkSourceNetworkChain stacks the three added middlewares cumulatively
// over a no-op handler; adjacent-row deltas = each middleware's per-request cost.
func BenchmarkSourceNetworkChain(b *testing.B) {
	silenceLogs(b)

	m, err := metrics.NewMetrics(sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewManualReader()),
	).Meter("bench"))
	if err != nil {
		b.Fatalf("NewMetrics: %v", err)
	}
	resolve := benchResolver(b)
	noop := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})

	stages := []struct {
		name  string
		build func(http.Handler) http.Handler
	}{
		{"1_baseline", func(h http.Handler) http.Handler {
			return hlog.NewHandler(log.Logger)(h)
		}},
		{"2_plus_geoip_middleware", func(h http.Handler) http.Handler {
			return hlog.NewHandler(log.Logger)(geoip.Middleware(resolve)(h))
		}},
		{"3_plus_log_context", func(h http.Handler) http.Handler {
			return hlog.NewHandler(log.Logger)(geoip.Middleware(resolve)(clientLogContext(h)))
		}},
		{"4_plus_traffic_metrics", func(h http.Handler) http.Handler {
			return hlog.NewHandler(log.Logger)(
				geoip.Middleware(resolve)(clientLogContext(metrics.TrafficMiddleware(m)(h))))
		}},
	}

	for _, stage := range stages {
		b.Run(stage.name, func(b *testing.B) {
			handler := stage.build(noop)
			req := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
			req.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.7")
			req.RemoteAddr = "10.40.10.11:44321"

			b.ReportAllocs()
			for b.Loop() {
				mrw := &metrics.ResponseWriter{ResponseWriter: httptest.NewRecorder()}
				handler.ServeHTTP(mrw, req)
			}
		})
	}
}

func silenceLogs(b *testing.B) {
	b.Helper()
	orig := log.Logger
	log.Logger = zerolog.New(io.Discard)
	b.Cleanup(func() { log.Logger = orig })
}
