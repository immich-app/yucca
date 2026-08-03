package adminapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// getJSON GETs path (with optional query) and decodes the JSON response.
func (c *Client) getJSON(ctx context.Context, path string, query url.Values, out any) error {
	u := c.baseURL + path
	if enc := query.Encode(); enc != "" {
		u += "?" + enc
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	c.setAuth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", u, resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("parse %s response: %w", u, err)
	}
	return nil
}

// putJSON PUTs a JSON body to path and decodes the JSON response into out
// (out may be nil).
func (c *Client) putJSON(ctx context.Context, path string, body, out any) error {
	u := c.baseURL + path
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	c.setAuth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("PUT %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("PUT %s: status %d", u, resp.StatusCode)
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("parse %s response: %w", u, err)
		}
	}
	return nil
}
