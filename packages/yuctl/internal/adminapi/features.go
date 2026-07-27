package adminapi

import (
	"context"
	"net/url"
)

// FeatureFlag mirrors the admin-api FeatureFlagDefDto: a registry entry plus
// its override count.
type FeatureFlag struct {
	Key         string `json:"key"`
	Default     bool   `json:"default"`
	Stage       string `json:"stage"`
	Description string `json:"description"`
	Since       string `json:"since"`
	Overrides   int    `json:"overrides"`
}

// FeatureOverride mirrors FeatureOverrideDto.
type FeatureOverride struct {
	Flag      string  `json:"flag"`
	Value     bool    `json:"value"`
	SetBy     string  `json:"setBy"`
	Reason    *string `json:"reason"`
	UpdatedAt string  `json:"updatedAt"`
}

// UserFeatures mirrors UserFeaturesResponseDto.
type UserFeatures struct {
	Features  map[string]bool   `json:"features"`
	Overrides []FeatureOverride `json:"overrides"`
}

// FeatureUser mirrors FeatureUserDto.
type FeatureUser struct {
	UserID    string  `json:"userId"`
	Email     string  `json:"email"`
	Value     bool    `json:"value"`
	SetBy     string  `json:"setBy"`
	Reason    *string `json:"reason"`
	UpdatedAt string  `json:"updatedAt"`
}

// ListFeatures returns the flag registry with override counts.
func (c *Client) ListFeatures(ctx context.Context) ([]FeatureFlag, error) {
	var out struct {
		Flags []FeatureFlag `json:"flags"`
	}
	if err := c.getJSON(ctx, "/api/features", nil, &out); err != nil {
		return nil, err
	}
	return out.Flags, nil
}

// GetUserFeatures returns a user's resolved flags and raw overrides.
func (c *Client) GetUserFeatures(ctx context.Context, userID string) (*UserFeatures, error) {
	var out UserFeatures
	if err := c.getJSON(ctx, "/api/user/"+url.PathEscape(userID)+"/features", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// SetUserFeature sets a per-user override for a flag.
func (c *Client) SetUserFeature(ctx context.Context, userID, flag string, value bool, reason string) (*FeatureOverride, error) {
	body := map[string]any{"value": value}
	if reason != "" {
		body["reason"] = reason
	}
	var out FeatureOverride
	path := "/api/user/" + url.PathEscape(userID) + "/features/" + url.PathEscape(flag)
	if err := c.putJSON(ctx, path, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ClearUserFeature removes a per-user override (reverting to the registry default).
func (c *Client) ClearUserFeature(ctx context.Context, userID, flag string) error {
	return c.deleteReq(ctx, "/api/user/"+url.PathEscape(userID)+"/features/"+url.PathEscape(flag))
}

// ListFeatureUsers returns the users holding an override for a flag.
func (c *Client) ListFeatureUsers(ctx context.Context, flag string) ([]FeatureUser, error) {
	var out struct {
		Items []FeatureUser `json:"items"`
	}
	if err := c.getJSON(ctx, "/api/features/"+url.PathEscape(flag)+"/users", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// EnableFeatureBatch enables a flag for the oldest count users without an
// override yet.
func (c *Client) EnableFeatureBatch(ctx context.Context, flag string, count int) ([]FeatureUser, error) {
	var out struct {
		Enabled []FeatureUser `json:"enabled"`
	}
	if err := c.postJSON(ctx, "/api/features/"+url.PathEscape(flag)+"/enable-batch", map[string]any{"count": count}, &out); err != nil {
		return nil, err
	}
	return out.Enabled, nil
}

// Consumer mirrors the admin-api ConsumerAdminDto.
type Consumer struct {
	ID         string  `json:"id"`
	UserID     string  `json:"userId"`
	Type       string  `json:"type"`
	Name       string  `json:"name"`
	CreatedAt  string  `json:"createdAt"`
	LastSeenAt *string `json:"lastSeenAt"`
}

// GetUserConsumers lists a user's consumer instances.
func (c *Client) GetUserConsumers(ctx context.Context, userID string) ([]Consumer, error) {
	var out struct {
		Consumers []Consumer `json:"consumers"`
	}
	if err := c.getJSON(ctx, "/api/user/"+url.PathEscape(userID)+"/consumers", nil, &out); err != nil {
		return nil, err
	}
	return out.Consumers, nil
}
