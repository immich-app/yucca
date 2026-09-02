package client

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"restic-proxy/internal/meta"
)

const testToken = "user-access-token"

func makeJWT(t *testing.T, claims map[string]any) string {
	t.Helper()
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}
	return "header." + base64.RawURLEncoding.EncodeToString(payload) + ".signature"
}

func validJWT(t *testing.T) string {
	t.Helper()
	return makeJWT(t, map[string]any{"exp": time.Now().Add(time.Hour).Unix()})
}

type request struct {
	method string
	path   string
	cookie string
}

func newAPI(t *testing.T, status int, body string, seen *request) Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, r *http.Request) {
		if seen != nil {
			seen.method = r.Method
			seen.path = r.URL.Path
			if cookie, err := r.Cookie(accessTokenCookie); err == nil {
				seen.cookie = cookie.Value
			}
		}
		writer.WriteHeader(status)
		fmt.Fprint(writer, body)
	}))
	t.Cleanup(server.Close)
	return New(meta.Api{Url: server.URL})
}

func resticURL(t *testing.T, host string) string {
	t.Helper()
	return fmt.Sprintf(`{"url":"rest:http://restic:%s@%s/repo-1"}`, validJWT(t), host)
}

func TestGrant_Success(t *testing.T) {
	var seen request
	client := newAPI(t, http.StatusCreated, resticURL(t, "backend.example:8000"), &seen)

	grant, err := client.Grant(context.Background(), testToken, "repo-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if grant.Username != "restic" {
		t.Errorf("expected username restic, got %s", grant.Username)
	}
	if grant.Scheme != "http" {
		t.Errorf("expected scheme http, got %s", grant.Scheme)
	}
	if grant.Host != "backend.example:8000" {
		t.Errorf("expected host backend.example:8000, got %s", grant.Host)
	}
	if grant.Path != "/repo-1" {
		t.Errorf("expected path /repo-1, got %s", grant.Path)
	}
	if grant.Password == "" {
		t.Error("expected the minted JWT as the password")
	}
	if !grant.ExpiresAt.After(time.Now()) {
		t.Errorf("expected an expiry in the future, got %s", grant.ExpiresAt)
	}
}

func TestGrant_SendsAccessTokenCookie(t *testing.T) {
	var seen request
	client := newAPI(t, http.StatusCreated, resticURL(t, "backend.example:8000"), &seen)

	if _, err := client.Grant(context.Background(), testToken, "repo-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if seen.cookie != testToken {
		t.Errorf("expected the access token in the %s cookie, got %q", accessTokenCookie, seen.cookie)
	}
	if seen.method != http.MethodPost {
		t.Errorf("expected POST, got %s", seen.method)
	}
	if seen.path != "/repository/repo-1/restic" {
		t.Errorf("unexpected path: %s", seen.path)
	}
}

func TestGrant_StatusError(t *testing.T) {
	cases := []struct {
		name   string
		status int
	}{
		{name: "unauthorized", status: http.StatusUnauthorized},
		{name: "forbidden", status: http.StatusForbidden},
		{name: "not found", status: http.StatusNotFound},
		{name: "server error", status: http.StatusInternalServerError},
		{name: "ok is not created", status: http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := newAPI(t, tc.status, `{}`, nil)

			_, err := client.Grant(context.Background(), testToken, "repo-1")
			if err == nil {
				t.Fatalf("expected an error for status %d", tc.status)
			}

			var status *StatusError
			if !errors.As(err, &status) {
				t.Fatalf("expected a *StatusError, got %T", err)
			}
			if status.Code != tc.status {
				t.Errorf("expected code %d, got %d", tc.status, status.Code)
			}
		})
	}
}

func TestGrant_MalformedResponses(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{name: "not json", body: `<html>`, want: ""},
		{name: "no credential", body: `{"url":"rest:http://backend.example/repo-1"}`, want: "no credential in restic URL"},
		{name: "credential is not a jwt", body: `{"url":"rest:http://restic:opaque@backend.example/repo-1"}`, want: "invalid JWT from server"},
		{name: "payload is not base64", body: `{"url":"rest:http://restic:header.!!!.signature@backend.example/repo-1"}`, want: ""},
		{name: "payload is not json", body: `{"url":"rest:http://restic:header.bm90LWpzb24.signature@backend.example/repo-1"}`, want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := newAPI(t, http.StatusCreated, tc.body, nil)

			_, err := client.Grant(context.Background(), testToken, "repo-1")
			if err == nil {
				t.Fatal("expected an error")
			}
			if tc.want != "" && !strings.Contains(err.Error(), tc.want) {
				t.Errorf("expected %q, got %v", tc.want, err)
			}
		})
	}
}

func TestGrant_ExpiryMissing(t *testing.T) {
	token := makeJWT(t, map[string]any{"sub": "someone"})
	body := fmt.Sprintf(`{"url":"rest:http://restic:%s@backend.example/repo-1"}`, token)
	client := newAPI(t, http.StatusCreated, body, nil)

	_, err := client.Grant(context.Background(), testToken, "repo-1")
	if err == nil {
		t.Fatal("expected an error for a JWT carrying no exp")
	}
	if !strings.Contains(err.Error(), "expiry missing from grant") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestGrant_Unreachable(t *testing.T) {
	client := New(meta.Api{Url: "http://127.0.0.1:1"})

	_, err := client.Grant(context.Background(), testToken, "repo-1")
	if err == nil {
		t.Fatal("expected an error when the API refuses the connection")
	}

	var status *StatusError
	if errors.As(err, &status) {
		t.Error("a transport failure must not surface as a StatusError")
	}
}

func TestGrant_ContextCancelled(t *testing.T) {
	client := newAPI(t, http.StatusCreated, resticURL(t, "backend.example:8000"), nil)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := client.Grant(ctx, testToken, "repo-1"); err == nil {
		t.Fatal("expected an error for a cancelled context")
	}
}

func TestStatusError_Error(t *testing.T) {
	err := &StatusError{Code: http.StatusNotFound, Status: "404 Not Found"}

	if got := err.Error(); got != "could not generate restic URL: 404 Not Found" {
		t.Errorf("unexpected message: %s", got)
	}
}

func TestGrant_TruncatedBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Length", "1000")
		writer.WriteHeader(http.StatusCreated)
		fmt.Fprint(writer, "short")
		writer.(http.Flusher).Flush()
		panic(http.ErrAbortHandler)
	}))
	t.Cleanup(server.Close)
	client := New(meta.Api{Url: server.URL})

	if _, err := client.Grant(context.Background(), testToken, "repo-1"); err == nil {
		t.Fatal("expected an error when the body is cut short")
	}
}

func TestGrant_UnparseableResticURL(t *testing.T) {
	client := newAPI(t, http.StatusCreated, `{"url":"rest:http://restic:jwt@[::1"}`, nil)

	_, err := client.Grant(context.Background(), testToken, "repo-1")
	if err == nil {
		t.Fatal("expected an error for an unparseable restic URL")
	}
	if !strings.Contains(err.Error(), "could not parse restic URL") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestGrant_UnbuildableRequest(t *testing.T) {
	client := New(meta.Api{Url: "http://api.example\n"})

	if _, err := client.Grant(context.Background(), testToken, "repo-1"); err == nil {
		t.Fatal("expected an error when the API URL cannot form a request")
	}
}

func TestGrant_ExpiredJWT(t *testing.T) {
	token := makeJWT(t, map[string]any{"exp": time.Now().Add(-time.Minute).Unix()})
	body := fmt.Sprintf(`{"url":"rest:http://restic:%s@backend.example/repo-1"}`, token)
	client := newAPI(t, http.StatusCreated, body, nil)

	_, err := client.Grant(context.Background(), testToken, "repo-1")
	if err == nil {
		t.Fatal("expected an error for a grant that has already expired")
	}
	if !strings.Contains(err.Error(), "received grant in the past") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestGrant_ExpiryComesFromTheJWT(t *testing.T) {
	exp := time.Now().Add(42 * time.Minute).Truncate(time.Second)
	token := makeJWT(t, map[string]any{"exp": exp.Unix()})
	body := fmt.Sprintf(`{"url":"rest:http://restic:%s@backend.example/repo-1"}`, token)
	client := newAPI(t, http.StatusCreated, body, nil)

	grant, err := client.Grant(context.Background(), testToken, "repo-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !grant.ExpiresAt.Equal(exp) {
		t.Errorf("expected the JWT exp %s, got %s", exp, grant.ExpiresAt)
	}
}
