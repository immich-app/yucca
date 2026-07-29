package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

var testPrivateKey, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
var testPublicKey = &testPrivateKey.PublicKey

const (
	testUser       = "00000000-0000-0000-0000-000000000001"
	testRepository = "00000000-0000-0000-0000-000000000002"
)

func makeJWT(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	signed, err := token.SignedString(testPrivateKey)
	if err != nil {
		t.Fatalf("failed to sign JWT: %v", err)
	}
	return signed
}

func makeBasicAuth(token string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("restic:"+token))
}

func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"user":       testUser,
		"repository": testRepository,
		"writeOnce":  false,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
}

func TestAuthMissingHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	_, _, err := extractAuth(req, testPublicKey)
	if err == nil {
		t.Fatal("expected error for missing auth header")
	}
	if err.code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", err.code)
	}
}

func TestAuthInvalidAuthType(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", "Bearer some-token")
	_, _, err := extractAuth(req, testPublicKey)
	if err == nil {
		t.Fatal("expected error for non-Basic auth")
	}
	if err.code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", err.code)
	}
}

func TestAuthMissingToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	// Basic auth with no password (just username, no colon)
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte("restic")))
	_, _, err := extractAuth(req, testPublicKey)
	if err == nil {
		t.Fatal("expected error for missing token")
	}
	if err.code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", err.code)
	}
}

func TestAuthInvalidJWT(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth("not-a-valid-jwt"))
	_, _, err := extractAuth(req, testPublicKey)
	if err == nil {
		t.Fatal("expected error for invalid JWT")
	}
	if err.code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", err.code)
	}
}

func TestAuthInvalidPayloadNonUUID(t *testing.T) {
	token := makeJWT(t, jwt.MapClaims{
		"user":       "not-a-uuid",
		"repository": testRepository,
		"writeOnce":  false,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	})
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(token))
	_, _, err := extractAuth(req, testPublicKey)
	if err == nil {
		t.Fatal("expected error for non-UUID user")
	}
	if err.code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", err.code)
	}
}

func TestAuthInvalidPayloadMissingWriteOnce(t *testing.T) {
	token := makeJWT(t, jwt.MapClaims{
		"user":       testUser,
		"repository": testRepository,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	})
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(token))
	_, _, err := extractAuth(req, testPublicKey)
	if err == nil {
		t.Fatal("expected error for missing writeOnce")
	}
	if err.code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", err.code)
	}
}

func TestAuthSuccess(t *testing.T) {
	token := makeJWT(t, validClaims())
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(token))

	a, _, err := extractAuth(req, testPublicKey)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.User != testUser {
		t.Errorf("expected user %s, got %s", testUser, a.User)
	}
	if a.Repository != testRepository {
		t.Errorf("expected repository %s, got %s", testRepository, a.Repository)
	}
	if a.WriteOnce != false {
		t.Error("expected writeOnce to be false")
	}
}

func TestAuthOptionalClaims(t *testing.T) {
	cases := []struct {
		name           string
		jti            any
		connection     any
		wantJti        string
		wantConnection string
	}{
		{name: "present", jti: "3f1f0d05-9a48-4a9e-8fb2-6f19f3f5f2aa", connection: "restic", wantJti: "3f1f0d05-9a48-4a9e-8fb2-6f19f3f5f2aa", wantConnection: "restic"},
		{name: "absent", jti: nil, connection: nil, wantJti: "", wantConnection: ""},
		{name: "garbage types ignored", jti: 42, connection: true, wantJti: "", wantConnection: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			claims := validClaims()
			if tc.jti != nil {
				claims["jti"] = tc.jti
			}
			if tc.connection != nil {
				claims["connection"] = tc.connection
			}
			token := makeJWT(t, claims)
			req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
			req.Header.Set("Authorization", makeBasicAuth(token))

			a, _, err := extractAuth(req, testPublicKey)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if a.Jti != tc.wantJti {
				t.Errorf("expected jti %q, got %q", tc.wantJti, a.Jti)
			}
			if a.Connection != tc.wantConnection {
				t.Errorf("expected connection %q, got %q", tc.wantConnection, a.Connection)
			}
		})
	}
}

func TestAuthMiddlewareRepoMismatch(t *testing.T) {
	token := makeJWT(t, validClaims())

	// Create a chi router to test the middleware with path params
	r := chi.NewRouter()
	r.Route("/{path}", func(r chi.Router) {
		r.Use(Middleware(testPublicKey))
		r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	// Use a different path than the repository in the JWT
	req := httptest.NewRequest(http.MethodGet, "/wrong-repo-id/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(token))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for repo mismatch, got %d", rec.Code)
	}
}

func TestAuthMiddlewareSuccess(t *testing.T) {
	token := makeJWT(t, validClaims())

	var gotAuth Auth
	r := chi.NewRouter()
	r.Route("/{path}", func(r chi.Router) {
		r.Use(Middleware(testPublicKey))
		r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
			gotAuth = FromContext(r.Context())
			w.WriteHeader(http.StatusOK)
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(token))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if gotAuth.User != testUser {
		t.Errorf("expected user %s in context, got %s", testUser, gotAuth.User)
	}
}

func TestVerifierCachesVerifiedTokens(t *testing.T) {
	token := makeJWT(t, validClaims())

	var lookups []bool
	v := NewVerifier(testPublicKey, func(hit bool) { lookups = append(lookups, hit) })

	for range 3 {
		req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
		req.Header.Set("Authorization", makeBasicAuth(token))
		a, err := v.authenticate(req)
		if err != nil {
			t.Fatalf("authenticate: %v", err)
		}
		if a.User != testUser || a.Repository != testRepository {
			t.Fatalf("unexpected auth: %+v", a)
		}
	}

	want := []bool{false, true, true}
	if len(lookups) != len(want) {
		t.Fatalf("lookups = %v, want %v", lookups, want)
	}
	for i := range want {
		if lookups[i] != want[i] {
			t.Fatalf("lookups = %v, want %v", lookups, want)
		}
	}
}

func TestVerifierCacheHonorsExpiry(t *testing.T) {
	token := makeJWT(t, validClaims())
	v := NewVerifier(testPublicKey, nil)

	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(token))
	if _, err := v.authenticate(req); err != nil {
		t.Fatalf("authenticate: %v", err)
	}

	// Force the cached entry past its expiry; the stale entry must be evicted
	// and the (still exp-valid) token re-verified rather than served stale.
	key := sha256.Sum256([]byte(makeBasicAuth(token)))
	if _, ok := v.cache.get(key, time.Now().Add(2*time.Hour)); ok {
		t.Fatal("expired cache entry served")
	}
	if _, ok := v.cache.get(key, time.Now()); ok {
		t.Fatal("expired entry should have been evicted")
	}
}

func TestVerifierDoesNotCacheInvalidTokens(t *testing.T) {
	otherKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	badToken := func() string {
		tok := jwt.NewWithClaims(jwt.SigningMethodES256, validClaims())
		signed, err := tok.SignedString(otherKey)
		if err != nil {
			t.Fatalf("sign: %v", err)
		}
		return signed
	}()

	v := NewVerifier(testPublicKey, nil)
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", makeBasicAuth(badToken))
	if _, err := v.authenticate(req); err == nil {
		t.Fatal("expected error for token signed by wrong key")
	}
	key := sha256.Sum256([]byte(makeBasicAuth(badToken)))
	if _, ok := v.cache.get(key, time.Now()); ok {
		t.Fatal("invalid token must not be cached")
	}
}
