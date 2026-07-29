package adminapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// SettingsEntry mirrors the admin-api SettingsEntryDto (src/dto/settings.dto.ts).
// Value holds the scoped config overrides (restic_pack_size_mib,
// connections_math, ...) — the admin-api validates keys and values.
type SettingsEntry struct {
	Scope     string         `json:"scope"`
	Value     map[string]any `json:"value"`
	UpdatedAt string         `json:"updatedAt"`
}

// ListSettings returns every settings scope (global / site:<code> /
// cluster:<code>) with its overrides.
func (c *Client) ListSettings(ctx context.Context) ([]SettingsEntry, error) {
	var out struct {
		Settings []SettingsEntry `json:"settings"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/api/settings", nil, &out); err != nil {
		return nil, err
	}
	return out.Settings, nil
}

// SetSettings replaces the overrides stored for scope. The admin-api rejects
// unknown keys and invalid values with a 400 whose message is surfaced here.
func (c *Client) SetSettings(ctx context.Context, scope string, value map[string]any) (*SettingsEntry, error) {
	var out struct {
		Entry SettingsEntry `json:"entry"`
	}
	if err := c.doJSON(ctx, http.MethodPut, "/api/settings/"+scope, value, &out); err != nil {
		return nil, err
	}
	return &out.Entry, nil
}

// DeleteSettings removes every override stored for scope.
func (c *Client) DeleteSettings(ctx context.Context, scope string) error {
	return c.deleteReq(ctx, "/api/settings/"+scope)
}

// doJSON is the generic JSON round-trip: like postJSON, but with an explicit
// method and with the response body included in non-2xx errors so admin-api
// validation messages reach the operator.
func (c *Client) doJSON(ctx context.Context, method, path string, body, out any) error {
	u := c.baseURL + path
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	c.setAuth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s %s: status %d: %s", method, u, resp.StatusCode, bytes.TrimSpace(snippet))
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("parse %s response: %w", u, err)
		}
	}
	return nil
}
