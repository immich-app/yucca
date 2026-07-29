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

	"michael/internal/revocation"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

// fakeValidator implements revocation.Validator for handler tests.
type fakeValidator struct {
	byJti   map[string]revocation.Decision
	fallbck revocation.Decision
	err     error
	calls   int
}

func (f *fakeValidator) Check(_ context.Context, jti string) (revocation.Decision, error) {
	f.calls++
	if f.byJti != nil {
		if d, ok := f.byJti[jti]; ok {
			return d, f.err
		}
	}
	return f.fallbck, f.err
}

func doRequestWithJti(t *testing.T, srv *Server, jti string) *httptest.ResponseRecorder {
	return doRequestWithJtiConn(t, srv, jti, "restic")
}

func doRequestWithJtiConn(t *testing.T, srv *Server, jti, connection string) *httptest.ResponseRecorder {
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
	if connection != "" {
		claims["connection"] = connection
	}
	req.Header.Set("Authorization", makeBasicAuth(makeJWT(t, claims)))

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// resticRevocable is the RevocableTypes set used by validity tests.
func resticRevocable() map[string]bool { return map[string]bool{"restic": true} }

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
	srv.Validator = &fakeValidator{fallbck: revocation.DecisionInvalid}
	srv.RevocableTypes = resticRevocable()

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
	validator := &fakeValidator{byJti: map[string]revocation.Decision{"good": revocation.DecisionValid}}
	srv.Validator = validator
	srv.RevocableTypes = resticRevocable()

	rec := doRequestWithJti(t, srv, "good")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if validator.calls != 1 {
		t.Fatalf("expected 1 validity check, got %d", validator.calls)
	}
}

func TestRevocationGraceAllowed(t *testing.T) {
	srv := newTestServer(configStore())
	srv.Validator = &fakeValidator{fallbck: revocation.DecisionGrace, err: errors.New("redis down")}
	srv.RevocableTypes = resticRevocable()

	rec := doRequestWithJti(t, srv, "graced")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (grace) during outage, got %d", rec.Code)
	}
}

func TestRevocationUnavailableRejected(t *testing.T) {
	srv := newTestServer(configStore())
	srv.Validator = &fakeValidator{fallbck: revocation.DecisionUnavailable, err: errors.New("redis down")}
	srv.RevocableTypes = resticRevocable()

	rec := doRequestWithJti(t, srv, "any")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 (fail-closed) when validity unknown, got %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if want := "could not be verified"; !strings.Contains(string(body), want) {
		t.Fatalf("expected body to contain %q, got %s", want, body)
	}
}

func TestRevocationDeniesResticTokenWithoutJti(t *testing.T) {
	srv := newTestServer(configStore())
	validator := &fakeValidator{fallbck: revocation.DecisionInvalid}
	srv.Validator = validator
	srv.RevocableTypes = resticRevocable()

	rec := doRequestWithJti(t, srv, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for a jti-less restic token, got %d", rec.Code)
	}
}

func TestRevocationSkipsNonRevocableConnection(t *testing.T) {
	srv := newTestServer(configStore())
	validator := &fakeValidator{fallbck: revocation.DecisionInvalid}
	srv.Validator = validator
	srv.RevocableTypes = resticRevocable()

	rec := doRequestWithJtiConn(t, srv, "immich-jti", "immich")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for non-revocable connection, got %d", rec.Code)
	}
	if validator.calls != 0 {
		t.Fatalf("expected no validity checks for immich connection, got %d", validator.calls)
	}
}

func TestRevocationDisabledWhenNil(t *testing.T) {
	srv := newTestServer(configStore())

	rec := doRequestWithJti(t, srv, "whatever")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with validity checking disabled, got %d", rec.Code)
	}
}

func TestRevocationRunsOnCachedTokens(t *testing.T) {
	srv := newTestServer(configStore())
	validator := &fakeValidator{byJti: map[string]revocation.Decision{"cached": revocation.DecisionValid}}
	srv.Validator = validator
	srv.RevocableTypes = resticRevocable()

	handler := srv.Handler()
	claims := jwt.MapClaims{
		"user":       testUser,
		"repository": testRepository,
		"writeOnce":  false,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
		"jti":        "cached",
		"connection": "restic",
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

	if validator.calls != 2 {
		t.Fatalf("expected 2 validity checks (one per request), got %d", validator.calls)
	}

	validator.byJti["cached"] = revocation.DecisionInvalid
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/config", nil)
	req.Header.Set("Authorization", token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after revocation, got %d", rec.Code)
	}
}
