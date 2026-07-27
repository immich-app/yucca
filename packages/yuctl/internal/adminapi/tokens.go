package adminapi

import (
	"context"
	"net/url"
	"strconv"
)

// ResticToken mirrors the admin-api ResticTokenDto (src/dto/resticToken.dto.ts).
type ResticToken struct {
	Jti          string  `json:"jti"`
	RepositoryID string  `json:"repositoryId"`
	UserID       string  `json:"userId"`
	ConsumerID   *string `json:"consumerId"`
	MintedBy     string  `json:"mintedBy"`
	Label        *string `json:"label"`
	ExpiresAt    string  `json:"expiresAt"`
	RevokedAt    *string `json:"revokedAt"`
	RevokedBy    *string `json:"revokedBy"`
	CreatedAt    string  `json:"createdAt"`
}

type resticTokenPage struct {
	Items      []ResticToken `json:"items"`
	NextCursor *string       `json:"nextCursor"`
}

// TokenFilters narrows ListTokens; zero values mean "no filter".
type TokenFilters struct {
	UserID       string
	RepositoryID string
	Active       bool
}

// ListTokens returns minted restic tokens, following cursor pagination.
func (c *Client) ListTokens(ctx context.Context, filters TokenFilters, limit int) ([]ResticToken, error) {
	var all []ResticToken
	cursor := ""
	for {
		q := url.Values{}
		if cursor != "" {
			q.Set("cursor", cursor)
		}
		if limit > 0 {
			q.Set("limit", strconv.Itoa(limit))
		}
		if filters.UserID != "" {
			q.Set("userId", filters.UserID)
		}
		if filters.RepositoryID != "" {
			q.Set("repositoryId", filters.RepositoryID)
		}
		if filters.Active {
			q.Set("active", "true")
		}

		var page resticTokenPage
		if err := c.getJSON(ctx, "/api/restic-tokens", q, &page); err != nil {
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

// RevokeToken revokes a minted restic token by jti (idempotent).
func (c *Client) RevokeToken(ctx context.Context, jti string) error {
	return c.deleteReq(ctx, "/api/restic-tokens/"+url.PathEscape(jti))
}
