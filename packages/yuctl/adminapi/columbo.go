package adminapi

import (
	"context"
)

// ColumboInvestigation mirrors the admin-api ColumboInvestigationDto.
type ColumboInvestigation struct {
	ID               string   `json:"id"`
	Status           string   `json:"status"`
	Note             *string  `json:"note"`
	Queries          []string `json:"queries"`
	Error            *string  `json:"error"`
	ToolCalls        int      `json:"toolCalls"`
	PromptTokens     int      `json:"promptTokens"`
	CompletionTokens int      `json:"completionTokens"`
}

// StartColumboInvestigation asks columbo (via the admin-api) to investigate
// one user's telemetry with a staff-supplied prompt. The investigation runs
// asynchronously; poll GetColumboInvestigation for the result.
func (c *Client) StartColumboInvestigation(ctx context.Context, userID, prompt string) (*ColumboInvestigation, error) {
	body := map[string]string{"userId": userID, "prompt": prompt}
	var out ColumboInvestigation
	if err := c.postJSON(ctx, "/api/columbo/investigations", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetColumboInvestigation returns the current state of one investigation.
func (c *Client) GetColumboInvestigation(ctx context.Context, id string) (*ColumboInvestigation, error) {
	var out ColumboInvestigation
	if err := c.getJSON(ctx, "/api/columbo/investigations/"+id, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
