package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

// fakeRevoker implements revocation.Revoker for handler tests.
type fakeRevoker struct {
	revoked map[string]bool
	err     error
	calls   int
}

func (f *fakeRevoker) IsRevoked(_ context.Context, jti string) (bool, error) {
	f.calls++
	if f.err != nil {
		return false, f.err
	}
	return f.revoked[jti], nil
}

func doRequestWithJti(t *testing.T, srv *Server, jti string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)

	claims := jwt.MapClaims{
		"user":       testUser,
		"repository": testRepository,
		"writeOnce":  false,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	if jti != "" {
		claims["jti"] = jti
	}
	req.Header.Set("Authorization", makeBasicAuth(makeJWT(t, claims)))

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func configStore() *mockStorage {
	return &mockStorage{
		headObjectFn: func(_ context.Context, _, _ string) (int64, error) {
			return 1, nil
		},
		getObjectFn: func(_ context.Context, _, _, _ string) (*storage.S3Object, error) {
			return &storage.S3Object{Body: io.NopCloser(strings.NewReader("cfg")), ContentLength: 3}, nil
		},
	}
}

func TestRevocationRevokedTokenRejected(t *testing.T) {
	srv := newTestServer(configStore())
	srv.Revoker = &fakeRevoker{revoked: map[string]bool{"bad": true}}

	rec := doRequestWithJti(t, srv, "bad")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for revoked token, got %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if want := "Token revoked"; !strings.Contains(string(body), want) {
		t.Fatalf("expected body to contain %q, got %s", want, body)
	}
}

func TestRevocationValidTokenAllowed(t *testing.T) {
	srv := newTestServer(configStore())
	revoker := &fakeRevoker{revoked: map[string]bool{}}
	srv.Revoker = revoker

	rec := doRequestWithJti(t, srv, "good")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if revoker.calls != 1 {
		t.Fatalf("expected 1 revocation check, got %d", revoker.calls)
	}
}

func TestRevocationFailsOpenOnError(t *testing.T) {
	srv := newTestServer(configStore())
	srv.Revoker = &fakeRevoker{err: errors.New("redis down")}

	rec := doRequestWithJti(t, srv, "any")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (fail-open) on revoker error, got %d", rec.Code)
	}
}

func TestRevocationSkipsLegacyTokens(t *testing.T) {
	srv := newTestServer(configStore())
	revoker := &fakeRevoker{revoked: map[string]bool{}}
	srv.Revoker = revoker

	rec := doRequestWithJti(t, srv, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for legacy token, got %d", rec.Code)
	}
	if revoker.calls != 0 {
		t.Fatalf("expected no revocation checks for legacy token, got %d", revoker.calls)
	}
}

func TestRevocationDisabledWhenNil(t *testing.T) {
	srv := newTestServer(configStore())

	rec := doRequestWithJti(t, srv, "whatever")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with revocation disabled, got %d", rec.Code)
	}
}

// checked-per-request even when the auth verifier serves the token from its
// cache: the second request must still hit the revoker.
func TestRevocationRunsOnCachedTokens(t *testing.T) {
	srv := newTestServer(configStore())
	revoker := &fakeRevoker{revoked: map[string]bool{}}
	srv.Revoker = revoker

	handler := srv.Handler()
	claims := jwt.MapClaims{
		"user":       testUser,
		"repository": testRepository,
		"writeOnce":  false,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
		"jti":        "cached",
	}
	token := makeBasicAuth(makeJWT(t, claims))

	for range 2 {
		req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
		req.Header.Set("Authorization", token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	}

	if revoker.calls != 2 {
		t.Fatalf("expected 2 revocation checks (one per request), got %d", revoker.calls)
	}

	// Revoke between requests: the same (auth-cached) token is now rejected.
	revoker.revoked["cached"] = true
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after revocation, got %d", rec.Code)
	}
}
