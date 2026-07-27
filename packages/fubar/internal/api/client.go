// Package api is fubar's client for yucca-api: device-flow login, repository
// management, restic URL minting, and backup telemetry.
package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const cookieName = "yucca-access-token"

type Client struct {
	baseURL     string
	accessToken string
	http        *http.Client
}

func NewClient(baseURL, accessToken string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		// Generous timeout: minting + metrics are fast, but device-flow SSE
		// uses its own client (no timeout) below.
		accessToken: accessToken,
		http:        &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: cookieName, Value: c.accessToken})

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("session expired or invalid — run `fubar login` again")
	}
	if resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("%s %s: forbidden — is the multi-consumer feature enabled for your account?", method, path)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%s %s: status %d", method, path, resp.StatusCode)
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("parse %s response: %w", path, err)
		}
	}
	return nil
}

// Auth is the /api/auth identity (subset fubar needs).
type Auth struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Email      string          `json:"email"`
	ConsumerID *string         `json:"consumerId"`
	Features   map[string]bool `json:"features"`
}

func (c *Client) GetAuth(ctx context.Context) (*Auth, error) {
	var out Auth
	if err := c.do(ctx, http.MethodGet, "/api/auth", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Repository is the yucca repository (subset fubar needs).
type Repository struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Worm         bool   `json:"worm"`
	ConsumerID   string `json:"consumerId"`
	ConsumerType string `json:"consumerType"`
	Meter        *struct {
		SizeBytes float64 `json:"sizeBytes"`
	} `json:"meter"`
	Metrics *struct {
		SizeBytes            float64 `json:"sizeBytes"`
		LastBackup           *string `json:"lastBackup"`
		LastSuccessfulBackup *string `json:"lastSuccessfulBackup"`
	} `json:"metrics"`
}

func (c *Client) ListRepositories(ctx context.Context) ([]Repository, error) {
	var out struct {
		Repositories []Repository `json:"repositories"`
	}
	if err := c.do(ctx, http.MethodGet, "/api/repository", nil, &out); err != nil {
		return nil, err
	}
	return out.Repositories, nil
}

func (c *Client) CreateRepository(ctx context.Context, name string, worm bool) (*Repository, error) {
	var out struct {
		Repository Repository `json:"repository"`
	}
	if err := c.do(ctx, http.MethodPost, "/api/repository", map[string]any{"name": name, "worm": worm}, &out); err != nil {
		return nil, err
	}
	return &out.Repository, nil
}

// ResticURL mints a fresh short-lived restic rest: URL for the repository.
// fubar never persists these — one is minted per run.
func (c *Client) ResticURL(ctx context.Context, repositoryID string) (string, error) {
	var out struct {
		URL string `json:"url"`
	}
	if err := c.do(ctx, http.MethodPost, "/api/repository/"+repositoryID+"/restic", nil, &out); err != nil {
		return "", err
	}
	return out.URL, nil
}

// --- telemetry (mirrors the orchestrator's contract) ---

func (c *Client) SubmitBackupStart(ctx context.Context, repositoryID string) error {
	return c.do(ctx, http.MethodPost, "/api/metrics/submit/"+repositoryID+"/backup/start", nil, nil)
}

func (c *Client) SubmitBackupEnd(ctx context.Context, repositoryID string, success bool, duration time.Duration) error {
	body := map[string]any{"success": success, "durationMs": duration.Milliseconds()}
	return c.do(ctx, http.MethodPost, "/api/metrics/submit/"+repositoryID+"/backup/end", body, nil)
}

func (c *Client) SubmitRepositorySize(ctx context.Context, repositoryID string, sizeBytes int64) error {
	body := map[string]any{"sizeBytes": sizeBytes}
	return c.do(ctx, http.MethodPatch, "/api/metrics/submit/"+repositoryID+"/size", body, nil)
}

func (c *Client) SubmitStructuredLog(ctx context.Context, summary string, data map[string]any) error {
	if data == nil {
		data = map[string]any{}
	}
	return c.do(ctx, http.MethodPost, "/api/metrics/submit/log", map[string]any{"summary": summary, "data": data}, nil)
}

// --- device flow ---

// DeviceEvent is one SSE message from GET /api/auth/oidc/device.
type DeviceEvent struct {
	Type            string `json:"type"` // START | SUCCESS | FAILURE
	UserCode        string `json:"userCode"`
	VerificationURI string `json:"verificationUri"`
	AccessToken     string `json:"accessToken"`
	Reason          string `json:"reason"`
}

// DeviceFlow runs the device-authorization login: onStart receives the
// user code + verification URI to show the user; the returned token is the
// yucca session. The session is registered as a fubar consumer named
// consumerName.
func DeviceFlow(ctx context.Context, baseURL, consumerName string, onStart func(DeviceEvent)) (string, error) {
	return DeviceFlowAs(ctx, baseURL, "fubar", consumerName, onStart)
}

// DeviceFlowAs is DeviceFlow with an explicit consumer type. fubar always uses
// "fubar"; the parameter exists for tests that need to exercise other types.
func DeviceFlowAs(ctx context.Context, baseURL, consumerType, consumerName string, onStart func(DeviceEvent)) (string, error) {
	u := strings.TrimRight(baseURL, "/") + "/api/auth/oidc/device?consumer_type=" + url.QueryEscape(consumerType) +
		"&consumer_name=" + url.QueryEscape(consumerName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "text/event-stream")

	// No timeout: the stream stays open while the user completes the browser
	// grant; ctx cancellation is the escape hatch.
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", fmt.Errorf("connect to %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("device flow: status %d from %s", resp.StatusCode, u)
	}

	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		var event DeviceEvent
		if json.Unmarshal([]byte(payload), &event) != nil {
			continue
		}
		switch event.Type {
		case "START":
			if onStart != nil {
				onStart(event)
			}
		case "SUCCESS":
			return event.AccessToken, nil
		case "FAILURE":
			switch event.Reason {
			case "FEATURE_NOT_ENABLED":
				return "", fmt.Errorf("your account does not have the multi-consumer feature enabled — ask an admin to run `yuctl users features set <you> multi-consumer on`")
			case "EMAIL_NOT_ALLOWED":
				return "", fmt.Errorf("this email is not allowed during the beta")
			default:
				return "", fmt.Errorf("login failed (%s)", event.Reason)
			}
		}
	}
	if err := sc.Err(); err != nil {
		return "", fmt.Errorf("device flow stream: %w", err)
	}
	return "", fmt.Errorf("device flow ended without a result")
}
