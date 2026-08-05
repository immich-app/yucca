// Package adminapi authenticates against yucca-admin-api via its CLI loopback
// login flow and queries its REST endpoints. Login never touches the IdP and
// needs no client secret: yuctl listens on 127.0.0.1:<random port>, opens the
// browser at /api/auth/cli/login with a state nonce + S256 code challenge; the
// admin-api (owner of the confidential OIDC client) runs the browser OIDC
// dance and redirects a one-time code to the loopback, which yuctl exchanges —
// with the verifier that never left this process — for an admin-api-minted
// ES256 session JWT sent as `Authorization: Bearer`.
package adminapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// Token is a cached admin-api CLI session: the minted JWT plus its subject and
// expiry (both also inside the JWT; duplicated for cheap validity checks).
type Token struct {
	AccessToken string    `json:"access_token"`
	Sub         string    `json:"sub"`
	Expiry      time.Time `json:"expiry"`
}

// Valid reports whether the cached token is present and not expired.
func (t *Token) Valid() bool {
	return t != nil && t.AccessToken != "" && t.Sub != "" && time.Now().Before(t.Expiry)
}

// loginTimeout bounds the wait for the operator to finish the browser flow.
const loginTimeout = 5 * time.Minute

type cliTokenResponse struct {
	AccessToken string `json:"accessToken"`
	ExpiresAt   string `json:"expiresAt"`
	Sub         string `json:"sub"`
}

// BrowserLogin runs the loopback flow against adminURL. promptFn gets the URL
// to open (openFn attempted first when non-nil; prompt always shown as
// fallback). Returns the minted session token.
func BrowserLogin(ctx context.Context, hc *http.Client, adminURL string, openFn func(url string) error, promptFn func(url string)) (*Token, error) {
	verifier := randB64(32)
	challenge := base64.RawURLEncoding.EncodeToString(func() []byte { s := sha256.Sum256([]byte(verifier)); return s[:] }())
	state := randB64(16)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("start loopback listener: %w", err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port

	loginURL := fmt.Sprintf("%s/api/auth/cli/login?port=%d&state=%s&code_challenge=%s",
		strings.TrimRight(adminURL, "/"), port, state, challenge)

	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("state") != state {
			http.Error(w, "state mismatch", http.StatusBadRequest)
			errCh <- fmt.Errorf("loopback callback state mismatch")
			return
		}
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "missing code", http.StatusBadRequest)
			errCh <- fmt.Errorf("loopback callback missing code")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><title>yuctl</title><body style=\"font-family:system-ui\"><p>Logged in — you can return to the terminal.</p></body>")
		codeCh <- code
	})}
	go srv.Serve(ln) //nolint:errcheck // Serve always returns on Close; real failures surface via the timeout below.
	defer srv.Close()

	if openFn != nil {
		_ = openFn(loginURL) // best-effort; the printed URL is the fallback
	}
	if promptFn != nil {
		promptFn(loginURL)
	}

	var code string
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case err := <-errCh:
		return nil, err
	case <-time.After(loginTimeout):
		return nil, fmt.Errorf("timed out waiting for browser login")
	case code = <-codeCh:
	}

	body, err := json.Marshal(map[string]string{"code": code, "codeVerifier": verifier})
	if err != nil {
		return nil, err
	}
	tokenURL := strings.TrimRight(adminURL, "/") + "/api/auth/cli/token"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("POST %s: %w", tokenURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("POST %s: status %d", tokenURL, resp.StatusCode)
	}
	var tr cliTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	expiry, err := time.Parse(time.RFC3339, tr.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("parse token expiry %q: %w", tr.ExpiresAt, err)
	}
	return &Token{AccessToken: tr.AccessToken, Sub: tr.Sub, Expiry: expiry}, nil
}

func randB64(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
