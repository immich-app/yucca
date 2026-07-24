package adminapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Repository mirrors the admin-api RepositoryAdminDto (the fields yuctl needs).
type Repository struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Worm bool   `json:"worm"`
}

func (c *Client) postJSON(ctx context.Context, path string, body, out any) error {
	u := c.baseURL + path
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
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, reader)
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
		return fmt.Errorf("POST %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("POST %s: status %d", u, resp.StatusCode)
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("parse %s response: %w", u, err)
		}
	}
	return nil
}

// CreateRepository creates a repository owned by the admin service user.
func (c *Client) CreateRepository(ctx context.Context, name string, worm bool) (*Repository, error) {
	var out struct {
		Repository Repository `json:"repository"`
	}
	body := map[string]any{"name": name, "worm": worm}
	if err := c.postJSON(ctx, "/api/repository", body, &out); err != nil {
		return nil, err
	}
	return &out.Repository, nil
}

// RepositoryURL mints a restic rest: URL (embedded repository token) for id.
func (c *Client) RepositoryURL(ctx context.Context, id string) (string, error) {
	var out struct {
		URL string `json:"url"`
	}
	if err := c.postJSON(ctx, "/api/repository/"+id+"/url", nil, &out); err != nil {
		return "", err
	}
	return out.URL, nil
}
