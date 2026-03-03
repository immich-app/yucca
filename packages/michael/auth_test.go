package main

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

var testSecret = []byte("cca13c34b450a77c1d4b9ecd25dff6aebc6d7417afdb31864f5943c59abd03a1")

const (
	testUser       = "00000000-0000-0000-0000-000000000001"
	testRepository = "00000000-0000-0000-0000-000000000002"
)

func makeJWT(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(testSecret)
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
	_, err := extractAuth(req, testSecret)
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
	_, err := extractAuth(req, testSecret)
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
	_, err := extractAuth(req, testSecret)
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
	_, err := extractAuth(req, testSecret)
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
	_, err := extractAuth(req, testSecret)
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
	_, err := extractAuth(req, testSecret)
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

	auth, err := extractAuth(req, testSecret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if auth.User != testUser {
		t.Errorf("expected user %s, got %s", testUser, auth.User)
	}
	if auth.Repository != testRepository {
		t.Errorf("expected repository %s, got %s", testRepository, auth.Repository)
	}
	if auth.WriteOnce != false {
		t.Error("expected writeOnce to be false")
	}
}

func TestAuthMiddlewareRepoMismatch(t *testing.T) {
	token := makeJWT(t, validClaims())

	// Create a chi router to test the middleware with path params
	r := chi.NewRouter()
	r.Route("/{path}", func(r chi.Router) {
		r.Use(authMiddleware(testSecret))
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
		r.Use(authMiddleware(testSecret))
		r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
			gotAuth = authFromContext(r.Context())
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
