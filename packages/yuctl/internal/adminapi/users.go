package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Cookie names mirror packages/yucca-admin-api/src/enum.ts.
const (
	cookieSub         = "yucca-admin-sub"
	cookieAccessToken = "yucca-admin-access-token"
)

// User mirrors the admin-api UserDto (src/dto/user.dto.ts).
type User struct {
	ID       string `json:"id"`
	Sub      string `json:"sub"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Disabled bool   `json:"disabled"`
}

// userPage is the paginated envelope returned by GET /api/user.
type userPage struct {
	Items      []User  `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

// Client talks to one admin-api instance using cookie auth.
type Client struct {
	baseURL string
	http    *http.Client
	token   Token
}

// NewClient builds an admin-api client. baseURL is the admin-api origin (no
// trailing slash needed); the /api prefix is added by each call.
func NewClient(baseURL string, token Token, hc *http.Client) *Client {
	if hc == nil {
		hc = http.DefaultClient
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: hc, token: token}
}

// setAuth attaches BOTH auth cookies. The admin-api validates them via OIDC
// userinfo; a Bearer header would be ignored.
func (c *Client) setAuth(req *http.Request) {
	req.AddCookie(&http.Cookie{Name: cookieSub, Value: c.token.Sub})
	req.AddCookie(&http.Cookie{Name: cookieAccessToken, Value: c.token.AccessToken})
}

// ListUsers returns every user, following the cursor pagination. limit (when
// > 0) sets the per-page size.
func (c *Client) ListUsers(ctx context.Context, limit int) ([]User, error) {
	var all []User
	cursor := ""
	for {
		page, err := c.listUserPage(ctx, cursor, limit)
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

func (c *Client) listUserPage(ctx context.Context, cursor string, limit int) (*userPage, error) {
	q := url.Values{}
	if cursor != "" {
		q.Set("cursor", cursor)
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	u := c.baseURL + "/api/user"
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
		return nil, fmt.Errorf("admin-api rejected cookies (status %d) — token may be expired or the device client lacks admin access", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", u, resp.StatusCode)
	}
	var page userPage
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return nil, fmt.Errorf("parse user page: %w", err)
	}
	return &page, nil
}

// ParseLimit is the exported validator for the --limit flag.
func ParseLimit(s string) (int, error) { return parseLimit(s) }
