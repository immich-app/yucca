// Package adminapi authenticates against Zitadel via the OAuth 2.0 device
// authorization flow and queries the yucca-admin-api.
//
// IMPORTANT: yucca-admin-api auth is COOKIE-based, not Bearer. The API validates
// the `yucca-admin-sub` + `yucca-admin-access-token` cookies by calling OIDC
// userinfo (see packages/yucca-admin-api/src/services/auth.service.ts), so we
// send BOTH cookies — never an Authorization header.
//
// UNTESTED AGAINST A LIVE ADMIN-API: this depends on out-of-band setup that does
// not exist yet — (a) a public OIDC device client registered for the admin
// scope, and (b) admin-api ingress exposure (it is in-cluster-only today). The
// flow is implemented to spec but has not been exercised end-to-end.
package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// oidcConfig is the subset of the OIDC discovery document we use.
type oidcConfig struct {
	DeviceAuthorizationEndpoint string `json:"device_authorization_endpoint"`
	TokenEndpoint               string `json:"token_endpoint"`
	UserinfoEndpoint            string `json:"userinfo_endpoint"`
}

// Token is the result of a successful device-flow authentication: the OIDC
// access token plus the subject claim, which together form the admin-api
// cookies.
type Token struct {
	AccessToken string    `json:"access_token"`
	Sub         string    `json:"sub"`
	Expiry      time.Time `json:"expiry"`
}

// Valid reports whether the cached token is present and not expired.
func (t *Token) Valid() bool {
	return t != nil && t.AccessToken != "" && t.Sub != "" && time.Now().Before(t.Expiry)
}

type deviceAuthResponse struct {
	DeviceCode              string `json:"device_code"`
	UserCode                string `json:"user_code"`
	VerificationURI         string `json:"verification_uri"`
	VerificationURIComplete string `json:"verification_uri_complete"`
	ExpiresIn               int    `json:"expires_in"`
	Interval                int    `json:"interval"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
	ExpiresIn   int    `json:"expires_in"`
	Error       string `json:"error"`
}

type userinfoResponse struct {
	Sub string `json:"sub"`
}

func discoverOIDC(ctx context.Context, hc *http.Client, issuer string) (*oidcConfig, error) {
	well := strings.TrimRight(issuer, "/") + "/.well-known/openid-configuration"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, well, nil)
	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch OIDC discovery %s: %w", well, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OIDC discovery %s: status %d", well, resp.StatusCode)
	}
	var cfg oidcConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("parse OIDC discovery: %w", err)
	}
	if cfg.DeviceAuthorizationEndpoint == "" || cfg.TokenEndpoint == "" {
		return nil, fmt.Errorf("OIDC issuer %s does not advertise a device-authorization endpoint", issuer)
	}
	return &cfg, nil
}

// DeviceLogin runs the full device-authorization flow against issuer using the
// public device clientID, printing the verification prompt via promptFn and
// polling until the user approves. The returned Token carries the access token
// and the resolved subject (from userinfo).
func DeviceLogin(ctx context.Context, hc *http.Client, issuer, clientID, scope string, promptFn func(verificationURI, userCode, complete string)) (*Token, error) {
	cfg, err := discoverOIDC(ctx, hc, issuer)
	if err != nil {
		return nil, err
	}

	form := url.Values{"client_id": {clientID}}
	if scope != "" {
		form.Set("scope", scope)
	}
	da, err := postForm[deviceAuthResponse](ctx, hc, cfg.DeviceAuthorizationEndpoint, form)
	if err != nil {
		return nil, fmt.Errorf("device authorization request: %w", err)
	}
	if promptFn != nil {
		promptFn(da.VerificationURI, da.UserCode, da.VerificationURIComplete)
	}

	interval := da.Interval
	if interval <= 0 {
		interval = 5
	}
	deadline := time.Now().Add(time.Duration(maxInt(da.ExpiresIn, 300)) * time.Second)

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Duration(interval) * time.Second):
		}

		tokForm := url.Values{
			"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
			"device_code": {da.DeviceCode},
			"client_id":   {clientID},
		}
		tr, err := postForm[tokenResponse](ctx, hc, cfg.TokenEndpoint, tokForm)
		if err != nil {
			return nil, err
		}
		switch tr.Error {
		case "":
			// success
		case "authorization_pending":
			continue
		case "slow_down":
			interval += 5
			continue
		default:
			return nil, fmt.Errorf("device token error: %s", tr.Error)
		}

		sub, err := fetchSub(ctx, hc, cfg.UserinfoEndpoint, tr.AccessToken)
		if err != nil {
			return nil, err
		}
		exp := time.Now().Add(time.Duration(maxInt(tr.ExpiresIn, 300)) * time.Second)
		return &Token{AccessToken: tr.AccessToken, Sub: sub, Expiry: exp}, nil
	}
	return nil, fmt.Errorf("device authorization timed out")
}

func fetchSub(ctx context.Context, hc *http.Client, userinfoEndpoint, accessToken string) (string, error) {
	if userinfoEndpoint == "" {
		return "", fmt.Errorf("OIDC issuer advertises no userinfo endpoint; cannot resolve subject")
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, userinfoEndpoint, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := hc.Do(req)
	if err != nil {
		return "", fmt.Errorf("userinfo: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("userinfo: status %d", resp.StatusCode)
	}
	var ui userinfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&ui); err != nil {
		return "", fmt.Errorf("parse userinfo: %w", err)
	}
	if ui.Sub == "" {
		return "", fmt.Errorf("userinfo response missing sub")
	}
	return ui.Sub, nil
}

func postForm[T any](ctx context.Context, hc *http.Client, endpoint string, form url.Values) (*T, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out T
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode response from %s: %w", endpoint, err)
	}
	return &out, nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// parseLimit validates a user-supplied page size for the admin-api.
func parseLimit(s string) (int, error) {
	if s == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("limit must be a positive integer")
	}
	return n, nil
}
