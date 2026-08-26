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

// Client talks to one admin-api instance using a CLI session JWT.
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

func (c *Client) setAuth(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.token.AccessToken)
}

// GetAuth verifies the session against GET /api/auth and returns the
// authenticated subject.
func (c *Client) GetAuth(ctx context.Context) (string, error) {
	u := c.baseURL + "/api/auth"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	c.setAuth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("GET %s: %w", u, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("admin-api rejected the session token (status 401) — run `yuctl login --reauth`")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: status %d", u, resp.StatusCode)
	}
	var out struct {
		Sub string `json:"sub"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("parse auth response: %w", err)
	}
	return out.Sub, nil
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

// ResolveUserID turns an email into a user id. The admin-api has no lookup
// endpoint, so this lists every user and matches case-insensitively.
func (c *Client) ResolveUserID(ctx context.Context, email string) (string, error) {
	users, err := c.ListUsers(ctx, 0)
	if err != nil {
		return "", err
	}
	for _, u := range users {
		if strings.EqualFold(u.Email, email) {
			return u.ID, nil
		}
	}
	return "", fmt.Errorf("no user with email %q", email)
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
		return nil, fmt.Errorf("admin-api rejected the session token (status %d) — run `yuctl login --reauth`", resp.StatusCode)
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

// ParseLimit validates a user-supplied --limit page size for the admin-api.
func ParseLimit(s string) (int, error) {
	if s == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("limit must be a positive integer")
	}
	return n, nil
}

// DiscordLink mirrors the admin-api UserDiscordLinkDto.
type DiscordLink struct {
	DiscordUserID   string `json:"discordUserId"`
	DiscordUsername string `json:"discordUsername"`
	CreatedAt       string `json:"createdAt"`
}

// UserDetail is the GET /api/user/:id envelope.
type UserDetail struct {
	User        User         `json:"user"`
	DiscordLink *DiscordLink `json:"discordLink"`
}

// GetUser returns a user with everything the admin-api knows about them.
func (c *Client) GetUser(ctx context.Context, userID string) (*UserDetail, error) {
	var out UserDetail
	if err := c.getJSON(ctx, "/api/user/"+url.PathEscape(userID), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// LinkDiscord binds a discord account to the user, replacing any existing link
// on either side.
func (c *Client) LinkDiscord(ctx context.Context, userID, discordID, discordUsername string) (*DiscordLink, error) {
	body := map[string]string{"discordUserId": discordID}
	if discordUsername != "" {
		body["discordUsername"] = discordUsername
	}
	var out DiscordLink
	if err := c.putJSON(ctx, "/api/user/"+url.PathEscape(userID)+"/discord", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UnlinkDiscord removes the user's discord link.
func (c *Client) UnlinkDiscord(ctx context.Context, userID string) error {
	return c.deleteReq(ctx, "/api/user/"+url.PathEscape(userID)+"/discord")
}
