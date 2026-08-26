package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// InviteClaim mirrors the admin-api DiscordInviteClaimDto.
type InviteClaim struct {
	ID              string  `json:"id"`
	DiscordUserID   string  `json:"discordUserId"`
	DiscordUsername *string `json:"discordUsername"`
	BatchID         *string `json:"batchId"`
	InviteUsed      bool    `json:"inviteUsed"`
	InviteUsedAt    *string `json:"inviteUsedAt"`
	CreatedAt       string  `json:"createdAt"`
}

// InviteBatch mirrors the admin-api DiscordInviteBatchDto.
type InviteBatch struct {
	ID                     string  `json:"id"`
	GuildID                string  `json:"guildId"`
	ChannelID              string  `json:"channelId"`
	MessageID              *string `json:"messageId"`
	MaxClaims              int     `json:"maxClaims"`
	Claimed                int     `json:"claimed"`
	Used                   int     `json:"used"`
	CreatedByDiscordUserID string  `json:"createdByDiscordUserId"`
	CancelledAt            *string `json:"cancelledAt"`
	CreatedAt              string  `json:"createdAt"`
}

// InviteBatchCancelResult is the DELETE /api/discord-invites/batches/:id envelope.
type InviteBatchCancelResult struct {
	Batch         InviteBatch `json:"batch"`
	RevokedClaims int         `json:"revokedClaims"`
}

// ListInviteClaims returns every Discord-minted beta invite claim.
func (c *Client) ListInviteClaims(ctx context.Context) ([]InviteClaim, error) {
	var out struct {
		Items []InviteClaim `json:"items"`
	}
	if err := c.getJSON(ctx, "/api/discord-invites", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// ListInviteBatches returns every invite drop with its claim counts.
func (c *Client) ListInviteBatches(ctx context.Context) ([]InviteBatch, error) {
	var out struct {
		Items []InviteBatch `json:"items"`
	}
	if err := c.getJSON(ctx, "/api/discord-invites/batches", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// RevokeInviteClaim deletes an unredeemed claim; the admin-api refuses claims
// that were already turned into accounts.
func (c *Client) RevokeInviteClaim(ctx context.Context, discordID string) error {
	return c.deleteWithMessage(ctx, "/api/discord-invites/"+url.PathEscape(discordID), nil)
}

// CancelInviteBatch soft-cancels a drop (no further claims) and optionally
// deletes its unredeemed claims.
func (c *Client) CancelInviteBatch(ctx context.Context, batchID string, revokeUnused bool) (*InviteBatchCancelResult, error) {
	path := "/api/discord-invites/batches/" + url.PathEscape(batchID)
	if revokeUnused {
		path += "?revokeUnused=true"
	}
	var out InviteBatchCancelResult
	if err := c.deleteWithMessage(ctx, path, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// deleteWithMessage issues a DELETE, decodes an optional JSON response into
// out, and surfaces the admin-api's error message on failure.
func (c *Client) deleteWithMessage(ctx context.Context, path string, out any) error {
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
		var body struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err == nil && body.Message != "" {
			return fmt.Errorf("DELETE %s: status %d: %s", u, resp.StatusCode, body.Message)
		}
		return fmt.Errorf("DELETE %s: status %d", u, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("parse response: %w", err)
	}
	return nil
}
