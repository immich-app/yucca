package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"michael/internal/auth"
	"michael/internal/cluster"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// clusterAuth returns an auth carrying an explicit storageCluster claim.
func clusterAuth(code string) auth.Auth {
	a := defaultAuth()
	a.StorageCluster = code
	return a
}

// recordingStorage is a mockStorage that remembers whether it was reached.
type recordingStorage struct {
	mockStorage
	hits int
}

func newRecordingStorage() *recordingStorage {
	rs := &recordingStorage{}
	rs.headObjectFn = func(_ context.Context, _, _ string) (int64, error) {
		rs.hits++
		return 7, nil
	}
	return rs
}

// twoClusterServer fronts "default" and "spice", each with its own storage.
func twoClusterServer() (*Server, *recordingStorage, *recordingStorage) {
	def, spice := newRecordingStorage(), newRecordingStorage()
	srv := NewClusterServer(map[string]storage.Storage{
		cluster.DefaultCode: def,
		"spice":             spice,
	}, cluster.DefaultCode, testPublicKey, nil)
	return srv, def, spice
}

func TestClusterRoutingNoClaimUsesDefault(t *testing.T) {
	srv, def, spice := twoClusterServer()

	rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/config", nil, defaultAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if def.hits != 1 {
		t.Errorf("expected the default cluster to serve the request, got %d hits", def.hits)
	}
	if spice.hits != 0 {
		t.Errorf("non-default cluster served a request with no claim (%d hits)", spice.hits)
	}
}

func TestClusterRoutingClaimSelectsCluster(t *testing.T) {
	srv, def, spice := twoClusterServer()

	rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/config", nil, clusterAuth("spice"), nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if spice.hits != 1 {
		t.Errorf("expected the claimed cluster to serve the request, got %d hits", spice.hits)
	}
	if def.hits != 0 {
		t.Errorf("default cluster served a request claiming another cluster (%d hits)", def.hits)
	}
}

// An explicitly empty claim is the same as no claim at all.
func TestClusterRoutingEmptyClaimUsesDefault(t *testing.T) {
	srv, def, spice := twoClusterServer()

	req := httptest.NewRequest(http.MethodHead, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(makeJWT(t, jwt.MapClaims{
		"user":           testUser,
		"repository":     testRepository,
		"writeOnce":      false,
		"storageCluster": "",
		"exp":            jwt.NewNumericDate(time.Now().Add(time.Hour)),
	})))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if def.hits != 1 || spice.hits != 0 {
		t.Errorf("expected default cluster to serve empty claim, got default=%d spice=%d", def.hits, spice.hits)
	}
}

// The critical fail-closed case: a claim michael can't resolve must never fall
// back to another cluster, on any route.
func TestClusterRoutingUnknownClusterRejected(t *testing.T) {
	buf := captureLogOutput(t)
	srv, def, spice := twoClusterServer()

	routes := []struct {
		method, path string
	}{
		{http.MethodPost, "/" + testRepository + "/?create=true"},
		{http.MethodHead, "/" + testRepository + "/config"},
		{http.MethodGet, "/" + testRepository + "/config"},
		{http.MethodPost, "/" + testRepository + "/config"},
		{http.MethodDelete, "/" + testRepository + "/config"},
		{http.MethodGet, "/" + testRepository + "/data"},
		{http.MethodHead, "/" + testRepository + "/data/" + testBlobName},
		{http.MethodGet, "/" + testRepository + "/data/" + testBlobName},
		{http.MethodPost, "/" + testRepository + "/data/" + testBlobName},
		{http.MethodDelete, "/" + testRepository + "/data/" + testBlobName},
	}
	for _, rt := range routes {
		rec := doRequest(t, srv, rt.method, rt.path, nil, clusterAuth("sietch"), map[string]string{
			"Accept": ContentTypeResticV2,
		})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s %s: expected 400 for unknown cluster, got %d", rt.method, rt.path, rec.Code)
		}
	}

	if def.hits != 0 || spice.hits != 0 {
		t.Errorf("a known cluster served a request for an unknown one (default=%d spice=%d)", def.hits, spice.hits)
	}

	warn := findLog(parseLogLines(t, buf), map[string]interface{}{"level": "warn", "cluster": "sietch"})
	if warn == nil {
		t.Fatalf("no warn log for the unknown cluster:\n%s", buf.String())
	}
	if warn["message"] != "token names an unknown storage cluster" {
		t.Errorf("unexpected warn message: %v", warn["message"])
	}
}

// A well-formed claim naming a cluster is still rejected on a single-cluster
// michael unless it matches that michael's default code — the legacy-token path
// must not be a wildcard.
func TestClusterRoutingSingleClusterRejectsForeignClaim(t *testing.T) {
	srv := newTestServer(&mockStorage{})

	rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/config", nil, clusterAuth("spice"), nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}

	rec = doRequest(t, srv, http.MethodHead, "/"+testRepository+"/config", nil, clusterAuth(cluster.DefaultCode), nil)
	if rec.Code == http.StatusBadRequest {
		t.Fatal("a claim naming the default cluster must be accepted")
	}
}

func TestClusterRoutingUnknownClusterCounted(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	m, err := metrics.NewMetrics(sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader)).Meter("test"))
	if err != nil {
		t.Fatalf("NewMetrics: %v", err)
	}
	srv := NewClusterServer(map[string]storage.Storage{cluster.DefaultCode: &mockStorage{}},
		cluster.DefaultCode, testPublicKey, m)

	for range 2 {
		rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/config", nil, clusterAuth("sietch"), nil)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	}
	// A known cluster must not move the counter.
	doRequest(t, srv, http.MethodHead, "/"+testRepository+"/config", nil, defaultAuth(), nil)

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatalf("Collect: %v", err)
	}

	var found bool
	for _, sm := range rm.ScopeMetrics {
		for _, mm := range sm.Metrics {
			if mm.Name != "storage.cluster.unknown" {
				continue
			}
			sum, ok := mm.Data.(metricdata.Sum[int64])
			if !ok {
				t.Fatalf("storage.cluster.unknown is %T, want a Sum[int64]", mm.Data)
			}
			for _, dp := range sum.DataPoints {
				code, _ := dp.Attributes.Value("cluster")
				if code.AsString() != "sietch" {
					t.Errorf("unexpected cluster label %q", code.AsString())
					continue
				}
				found = true
				if dp.Value != 2 {
					t.Errorf("storage.cluster.unknown{cluster=sietch} = %d, want 2", dp.Value)
				}
			}
		}
	}
	if !found {
		t.Error("storage.cluster.unknown was not emitted for the rejected requests")
	}
}

func TestClusterRoutingNonStringClaimRejected(t *testing.T) {
	srv, _, _ := twoClusterServer()

	for name, value := range map[string]any{"number": 42, "bool": true, "object": map[string]any{"code": "spice"}} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodHead, "/"+testRepository+"/config", nil)
			req.Header.Set("Authorization", makeBasicAuth(makeJWT(t, jwt.MapClaims{
				"user":           testUser,
				"repository":     testRepository,
				"writeOnce":      false,
				"storageCluster": value,
				"exp":            jwt.NewNumericDate(time.Now().Add(time.Hour)),
			})))
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for a non-string storageCluster, got %d", rec.Code)
			}
		})
	}
}
