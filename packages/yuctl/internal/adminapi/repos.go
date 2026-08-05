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
	ID             string `json:"id"`
	Name           string `json:"name"`
	Worm           bool   `json:"worm"`
	ConnectionID   string `json:"connectionId"`
	ConnectionType string `json:"connectionType"`
	User           struct {
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
// connection type; zero values keep the admin-service-user default.
type CreateRepositoryOptions struct {
	UserID         string
	ConnectionType string
}

// CreateRepository creates a repository. Without options it is owned by the
// admin service user; with UserID it is provisioned onto that user (default
// connection type: restic / "Manual restic").
func (c *Client) CreateRepository(ctx context.Context, name string, worm bool, opts CreateRepositoryOptions) (*Repository, error) {
	var out struct {
		Repository Repository `json:"repository"`
	}
	body := map[string]any{"name": name, "worm": worm}
	if opts.UserID != "" {
		body["userId"] = opts.UserID
	}
	if opts.ConnectionType != "" {
		body["connectionType"] = opts.ConnectionType
	}
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

// StorageCredentials carries no secret: it never leaves the API.
type StorageCredentials struct {
	StorageUserID      string `json:"storageUserId"`
	StorageClusterCode string `json:"storageClusterCode"`
	AccessKeyID        string `json:"accessKeyId"`
}

// rotate issues a fresh key pair, invalidating the credentials any
// already-minted token carries.
func (c *Client) ProvisionStorageCredentials(ctx context.Context, id string, rotate bool) (*StorageCredentials, error) {
	var out StorageCredentials
	if err := c.postJSON(ctx, "/api/repository/"+id+"/storage-credentials", map[string]any{"rotate": rotate}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
