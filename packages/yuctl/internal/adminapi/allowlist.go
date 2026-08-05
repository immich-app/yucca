package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// AllowlistEntry mirrors the admin-api AllowlistEntryDto (src/dto/allowlist.dto.ts).
type AllowlistEntry struct {
	ID           string  `json:"id"`
	Email        string  `json:"email"`
	InviteCode   string  `json:"inviteCode"`
	Invited      bool    `json:"invited"`
	InviteUsed   bool    `json:"inviteUsed"`
	InviteUsedAt *string `json:"inviteUsedAt"`
	CreatedAt    string  `json:"createdAt"`
}

// allowlistPage is the paginated envelope returned by GET /api/allowlist.
type allowlistPage struct {
	Items      []AllowlistEntry `json:"items"`
	NextCursor *string          `json:"nextCursor"`
}

// ListAllowlist returns every allowlist entry, following the cursor
// pagination. limit (when > 0) sets the per-page size.
func (c *Client) ListAllowlist(ctx context.Context, limit int) ([]AllowlistEntry, error) {
	var all []AllowlistEntry
	cursor := ""
	for {
		page, err := c.listAllowlistPage(ctx, cursor, limit)
		if err != nil {
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

func (c *Client) listAllowlistPage(ctx context.Context, cursor string, limit int) (*allowlistPage, error) {
	q := url.Values{}
	if cursor != "" {
		q.Set("cursor", cursor)
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	u := c.baseURL + "/api/allowlist"
	if enc := q.Encode(); enc != "" {
		u += "?" + enc
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	c.setAuth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GET %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", u, resp.StatusCode)
	}
	var page allowlistPage
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return nil, fmt.Errorf("parse allowlist page: %w", err)
	}
	return &page, nil
}

// AddAllowlistEntry adds an email to the allowlist. A staged entry does not
// allow login until it is invited.
func (c *Client) AddAllowlistEntry(ctx context.Context, email string, staged bool) (*AllowlistEntry, error) {
	var out struct {
		Entry AllowlistEntry `json:"entry"`
	}
	body := map[string]any{"email": email, "staged": staged}
	if err := c.postJSON(ctx, "/api/allowlist", body, &out); err != nil {
		return nil, err
	}
	return &out.Entry, nil
}

func (c *Client) RemoveAllowlistEntry(ctx context.Context, email string) error {
	return c.deleteReq(ctx, "/api/allowlist/"+url.PathEscape(email))
}

// InviteEmails marks the given emails as invited, creating entries for
// unknown emails.
func (c *Client) InviteEmails(ctx context.Context, emails []string) ([]AllowlistEntry, error) {
	var out struct {
		Items []AllowlistEntry `json:"items"`
	}
	body := map[string]any{"emails": emails}
	if err := c.postJSON(ctx, "/api/allowlist/invite", body, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// InviteBatch invites the oldest count staged entries.
func (c *Client) InviteBatch(ctx context.Context, count int) ([]AllowlistEntry, error) {
	var out struct {
		Items []AllowlistEntry `json:"items"`
	}
	body := map[string]any{"count": count}
	if err := c.postJSON(ctx, "/api/allowlist/invite-batch", body, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

func (c *Client) deleteReq(ctx context.Context, path string) error {
	u := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	c.setAuth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("DELETE %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("DELETE %s: status %d", u, resp.StatusCode)
	}
	return nil
}
