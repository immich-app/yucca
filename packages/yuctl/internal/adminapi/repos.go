package adminapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	neturl "net/url"
	"strconv"
)

// Repository mirrors the admin-api RepositoryAdminDto (the fields yuctl needs).
type Repository struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Worm         bool   `json:"worm"`
	ConsumerID   string `json:"consumerId"`
	ConsumerType string `json:"consumerType"`
	User         struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
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

// CreateRepositoryOptions targets CreateRepository at a specific owner and
// consumer type; zero values keep the admin-service-user default.
type CreateRepositoryOptions struct {
	UserID       string
	ConsumerType string
}

// CreateRepository creates a repository. Without options it is owned by the
// admin service user; with UserID it is provisioned onto that user (default
// consumer type: restic / "Manual restic").
func (c *Client) CreateRepository(ctx context.Context, name string, worm bool, opts CreateRepositoryOptions) (*Repository, error) {
	var out struct {
		Repository Repository `json:"repository"`
	}
	body := map[string]any{"name": name, "worm": worm}
	if opts.UserID != "" {
		body["userId"] = opts.UserID
	}
	if opts.ConsumerType != "" {
		body["consumerType"] = opts.ConsumerType
	}
	if err := c.postJSON(ctx, "/api/repository", body, &out); err != nil {
		return nil, err
	}
	return &out.Repository, nil
}

// MintedURL is the result of minting a repository token: the restic rest: URL
// plus the token's identity (jti) and expiry, for auditing/revocation.
type MintedURL struct {
	URL       string `json:"url"`
	Jti       string `json:"jti"`
	ExpiresAt string `json:"expiresAt"`
}

// URLOptions tunes the minted token; zero values use the server defaults.
type URLOptions struct {
	ExpiresIn string // duration like "30d"; capped server-side
	Label     string // audit label stored on the token
}

// RepositoryURL mints a restic rest: URL (embedded repository token) for id.
func (c *Client) RepositoryURL(ctx context.Context, id string, opts URLOptions) (*MintedURL, error) {
	body := map[string]any{}
	if opts.ExpiresIn != "" {
		body["expiresIn"] = opts.ExpiresIn
	}
	if opts.Label != "" {
		body["label"] = opts.Label
	}
	var out MintedURL
	if err := c.postJSON(ctx, "/api/repository/"+id+"/url", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

type repositoryPage struct {
	Items      []Repository `json:"items"`
	NextCursor *string      `json:"nextCursor"`
}

// ListRepositories lists repositories (optionally for one user), following
// cursor pagination.
func (c *Client) ListRepositories(ctx context.Context, userID string, limit int) ([]Repository, error) {
	var all []Repository
	cursor := ""
	for {
		q := neturl.Values{}
		if cursor != "" {
			q.Set("cursor", cursor)
		}
		if limit > 0 {
			q.Set("limit", strconv.Itoa(limit))
		}
		if userID != "" {
			q.Set("userId", userID)
		}
		var page repositoryPage
		if err := c.getJSON(ctx, "/api/repository", q, &page); err != nil {
			return nil, err
		}
		all = append(all, page.Items...)
		if page.NextCursor == nil || *page.NextCursor == "" {
			break
		}
		cursor = *page.NextCursor
	}
	return all, nil
}
