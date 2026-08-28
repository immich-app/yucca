// Package o11y queries the observability stack (VictoriaMetrics +
// VictoriaLogs) on behalf of ONE user. Every query is scoped server-side to
// that user — via extra_label for PromQL and a parenthesized AND-filter for
// LogsQL — regardless of what the query text says. This scoping is the only
// wall between the agent and other users' telemetry (the vmauth endpoints
// are unauthenticated from the cluster), so it must never depend on the
// model composing its queries correctly. Logs match either per-user field
// convention: michael writes `user`, the NestJS services `customerId`
// (mirroring the yucca-per-user dashboard's scoping).
package o11y

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
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
	params := url.Values{}
	params.Set("query", fmt.Sprintf("(user:=%q or customerId:=%q) and (%s)", c.CustomerID, c.CustomerID, query))
	params.Set("start", start)
	params.Set("end", end)
	params.Set("limit", strconv.Itoa(limit))
	return c.do(ctx, c.LogsURL+"/select/logsql/query", params)
}

func (c *Client) do(ctx context.Context, endpoint string, params url.Values) (string, error) {
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
