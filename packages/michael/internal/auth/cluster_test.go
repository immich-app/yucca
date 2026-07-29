package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

func authRequest(t *testing.T, claims jwt.MapClaims) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(makeJWT(t, claims)))
	return req
}

func TestAuthStorageClusterAbsent(t *testing.T) {
	a, _, err := extractAuth(authRequest(t, validClaims()), testPublicKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.StorageCluster != "" {
		t.Errorf("expected empty storage cluster for a legacy token, got %q", a.StorageCluster)
	}
}

func TestAuthStorageClusterValid(t *testing.T) {
	for _, code := range []string{"spice", "sietch-2", "a", strings.Repeat("x", 64)} {
		claims := validClaims()
		claims["storageCluster"] = code
		a, _, err := extractAuth(authRequest(t, claims), testPublicKey)
		if err != nil {
			t.Fatalf("code %q: unexpected error: %v", code, err)
		}
		if a.StorageCluster != code {
			t.Errorf("expected storage cluster %q, got %q", code, a.StorageCluster)
		}
	}
}

func TestAuthStorageClusterInvalid(t *testing.T) {
	cases := map[string]any{
		"non-string":   42,
		"boolean":      true,
		"uppercase":    "Spice",
		"underscore":   "spice_1",
		"path escape":  "../spice",
		"too long":     strings.Repeat("x", 65),
		"with spaces":  "spice cluster",
		"with newline": "spice\n",
	}
	for name, value := range cases {
		t.Run(name, func(t *testing.T) {
			claims := validClaims()
			claims["storageCluster"] = value
			_, _, err := extractAuth(authRequest(t, claims), testPublicKey)
			if err == nil {
				t.Fatal("expected an error for a malformed storageCluster claim")
			}
			if err.code != http.StatusBadRequest {
				t.Errorf("expected 400, got %d", err.code)
			}
		})
	}
}

// The token cache is keyed by the Authorization header, so two tokens differing
// only in storageCluster must not share an entry — a collision would serve one
// user's repository out of another cluster.
func TestVerifierCacheKeepsClustersDistinct(t *testing.T) {
	v := NewVerifier(testPublicKey, nil)

	for _, code := range []string{"spice", "sietch", ""} {
		claims := validClaims()
		if code != "" {
			claims["storageCluster"] = code
		}
		req := authRequest(t, claims)

		// Twice each, so the second pass is served from the cache.
		for range 2 {
			a, err := v.authenticate(req)
			if err != nil {
				t.Fatalf("code %q: authenticate: %v", code, err)
			}
			if a.StorageCluster != code {
				t.Fatalf("expected storage cluster %q from cache, got %q", code, a.StorageCluster)
			}
		}
	}
}

func TestVerifierCachesStorageCluster(t *testing.T) {
	claims := validClaims()
	claims["storageCluster"] = "spice"
	req := authRequest(t, claims)

	var lookups []bool
	v := NewVerifier(testPublicKey, func(hit bool) { lookups = append(lookups, hit) })

	for range 2 {
		a, err := v.authenticate(req)
		if err != nil {
			t.Fatalf("authenticate: %v", err)
		}
		if a.StorageCluster != "spice" {
			t.Fatalf("expected storage cluster spice, got %q", a.StorageCluster)
		}
	}
	if len(lookups) != 2 || lookups[0] || !lookups[1] {
		t.Fatalf("expected a miss then a hit, got %v", lookups)
	}
}

// A malformed claim must be rejected on every request, not just the first —
// only signature-valid, fully-parsed tokens may enter the cache.
func TestVerifierDoesNotCacheInvalidCluster(t *testing.T) {
	claims := validClaims()
	claims["storageCluster"] = "NOT VALID"
	req := authRequest(t, claims)

	v := NewVerifier(testPublicKey, nil)
	for range 2 {
		if _, err := v.authenticate(req); err == nil {
			t.Fatal("expected an error for a malformed storageCluster claim")
		}
	}
}

func TestAuthMiddlewarePassesStorageCluster(t *testing.T) {
	claims := validClaims()
	claims["storageCluster"] = "spice"

	var got Auth
	r := chi.NewRouter()
	r.Route("/{path}", func(r chi.Router) {
		r.Use(Middleware(testPublicKey))
		r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
			got = FromContext(r.Context())
			w.WriteHeader(http.StatusOK)
		})
	})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authRequest(t, claims))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got.StorageCluster != "spice" {
		t.Errorf("expected storage cluster spice in context, got %q", got.StorageCluster)
	}
}

func TestAuthStorageClusterNullClaim(t *testing.T) {
	claims := validClaims()
	claims["storageCluster"] = nil
	a, _, err := extractAuth(authRequest(t, claims), testPublicKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.StorageCluster != "" {
		t.Errorf("expected a null claim to route to the default cluster, got %q", a.StorageCluster)
	}
}
