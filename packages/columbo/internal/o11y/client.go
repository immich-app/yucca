// Package o11y queries the observability stack (VictoriaMetrics +
// VictoriaLogs) on behalf of ONE user. Every query is scoped server-side to
// that user — via extra_label for PromQL and a parenthesized AND-filter for
// LogsQL — regardless of what the query text says. This scoping is the only
// wall between the agent and other users' telemetry (the vmauth endpoints
// are unauthenticated from the cluster), so it must never depend on the
// model composing its queries correctly. Logs match either per-user field
// convention: michael writes `user`, the NestJS services `customerId`
// (mirroring the yucca-per-user dashboard's scoping). QueryFleetRange is the
// single unscoped exception; see its doc.
package o11y

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

const maxResponseBytes = 4 << 20

type Client struct {
	MetricsURL string
	LogsURL    string
	CustomerID string
	HTTPClient *http.Client
}

func NewClient(metricsURL, logsURL, customerID string) *Client {
	return &Client{
		MetricsURL: strings.TrimRight(metricsURL, "/"),
		LogsURL:    strings.TrimRight(logsURL, "/"),
		CustomerID: customerID,
		HTTPClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// MetricNames lists the metric names that actually carry data for this user
// within the lookback, so the agent starts from what exists instead of
// guessing. Scoped the same way as every query.
func (c *Client) MetricNames(ctx context.Context, lookback time.Duration) ([]string, error) {
	params := url.Values{}
	params.Set("start", strconv.FormatInt(time.Now().Add(-lookback).Unix(), 10))
	params.Set("extra_label", "customerId="+c.CustomerID)
	body, err := c.do(ctx, c.MetricsURL+"/api/v1/label/__name__/values", params)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Data []string `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return nil, err
	}
	return parsed.Data, nil
}

// QueryFleetRange runs a platform-health query with NO per-user scope. It is
// the one deliberate exception to this package's scoping rule and must only
// ever receive queries from the harness's fixed probe registry, never
// model-composed text — the registry is what keeps this path from becoming a
// cross-tenant hole.
func (c *Client) QueryFleetRange(ctx context.Context, query, start, end, step string) (string, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", start)
	params.Set("end", end)
	params.Set("step", step)
	return c.do(ctx, c.MetricsURL+"/api/v1/query_range", params)
}

func (c *Client) QueryMetricsRange(ctx context.Context, query, start, end, step string) (string, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", start)
	params.Set("end", end)
	params.Set("step", step)
	params.Set("extra_label", "customerId="+c.CustomerID)
	return c.do(ctx, c.MetricsURL+"/api/v1/query_range", params)
}

func (c *Client) QueryLogs(ctx context.Context, query, start, end string, limit int) (string, error) {
	scoped, err := scopeLogsQL(c.CustomerID, query)
	if err != nil {
		return "", err
	}
	params := url.Values{}
	params.Set("query", scoped)
	params.Set("start", start)
	params.Set("end", end)
	params.Set("limit", strconv.Itoa(limit))
	return c.do(ctx, c.LogsURL+"/select/logsql/query", params)
}

// scopeLogsQL wraps the filter part of a LogsQL query in the per-user scope.
// Pipes cannot live inside parentheses, so the query is split at its first
// top-level pipe and only the filter half is wrapped — pipes never widen the
// row set, they only transform it. The exceptions are join and union, whose
// inner queries would run unscoped, so they are refused outright.
func scopeLogsQL(customerID, query string) (string, error) {
	filter, pipes := splitLogsQLPipes(query)
	if filter == "" {
		filter = "*"
	}
	if err := rejectScopeEscapingPipes(pipes); err != nil {
		return "", err
	}
	scoped := fmt.Sprintf("(user:=%q or customerId:=%q) and (%s)", customerID, customerID, filter)
	if pipes != "" {
		scoped += " |" + pipes
	}
	return scoped, nil
}

func splitLogsQLPipes(query string) (filter, pipes string) {
	inQuote := byte(0)
	for i := 0; i < len(query); i++ {
		ch := query[i]
		switch {
		case inQuote != 0:
			switch ch {
			case '\\':
				i++
			case inQuote:
				inQuote = 0
			}
		case ch == '"' || ch == '\'' || ch == '`':
			inQuote = ch
		case ch == '|':
			return strings.TrimSpace(query[:i]), query[i+1:]
		}
	}
	return strings.TrimSpace(query), ""
}

func rejectScopeEscapingPipes(pipes string) error {
	for _, token := range strings.FieldsFunc(strings.ToLower(pipes), func(r rune) bool {
		return r == ' ' || r == '\t' || r == '\n' || r == '|' || r == '('
	}) {
		if token == "join" || token == "union" {
			return fmt.Errorf("the %s pipe is not allowed: its inner query would not be scoped to this user", token)
		}
	}
	return nil
}

func (c *Client) do(ctx context.Context, endpoint string, params url.Values) (string, error) {
	zerolog.Ctx(ctx).Info().
		Str("audit", "backend_query").
		Str("endpoint", endpoint).
		Str("params", params.Encode()).
		Msg("columbo audit: backend query")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(params.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("query failed with status %d: %s", resp.StatusCode, truncate(string(body), 1024))
	}
	if len(body) > maxResponseBytes {
		return "", fmt.Errorf(
			"response exceeded %d bytes — narrow the query, shorten the time range, or lower the limit",
			maxResponseBytes,
		)
	}
	return string(body), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
