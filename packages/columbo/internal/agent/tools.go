package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"columbo/internal/o11y"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"
	"github.com/itchyny/gojq"
)

const (
	jqTimeout        = 10 * time.Second
	maxJqOutputBytes = 4 << 20
	maxLookback      = 30 * 24 * time.Hour
	minStep          = time.Minute
)

var errToolBudget = errors.New("tool budget exhausted — write your conclusion with what you have")

// toolbox is the complete capability surface the model gets: two read-only
// queries pre-scoped to one user, and an in-process jq over stored results.
// No tool takes a URL, a header, or a credential.
type toolbox struct {
	o11y  *o11y.Client
	store *ResultStore

	mu        sync.Mutex
	calls     int
	maxCalls  int
	maxResult int
	queries   []string
}

func newToolbox(client *o11y.Client, store *ResultStore, maxCalls, maxResult int) *toolbox {
	return &toolbox{o11y: client, store: store, maxCalls: maxCalls, maxResult: maxResult}
}

func (t *toolbox) tools() ([]tool.BaseTool, error) {
	metrics, err := utils.InferTool("query_metrics", metricsDescription, t.queryMetrics)
	if err != nil {
		return nil, err
	}
	logs, err := utils.InferTool("query_logs", logsDescription, t.queryLogs)
	if err != nil {
		return nil, err
	}
	jq, err := utils.InferTool("jq", jqDescription, t.jq)
	if err != nil {
		return nil, err
	}
	return []tool.BaseTool{metrics, logs, jq}, nil
}

func (t *toolbox) queriesRun() []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return append([]string(nil), t.queries...)
}

func (t *toolbox) spend(description string) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.calls >= t.maxCalls {
		return errToolBudget
	}
	t.calls++
	t.queries = append(t.queries, description)
	return nil
}

const metricsDescription = "Run a PromQL range query against the user's metrics. " +
	"The result is automatically restricted to this user — do not add user filters yourself. " +
	"Returns Prometheus API JSON; large results are stored and returned as a preview plus a ref for the jq tool."

type metricsArgs struct {
	Query string `json:"query" jsonschema:"description=PromQL expression"`
	Start string `json:"start,omitempty" jsonschema:"description=Range start as RFC3339 or unix seconds; defaults to 24h ago, capped at 30 days back"`
	End   string `json:"end,omitempty" jsonschema:"description=Range end as RFC3339 or unix seconds; defaults to now"`
	Step  string `json:"step,omitempty" jsonschema:"description=Resolution step such as 5m; defaults to 5m, minimum 1m"`
}

func (t *toolbox) queryMetrics(ctx context.Context, args metricsArgs) (string, error) {
	if err := t.spend("metrics: " + args.Query); err != nil {
		return "", err
	}
	start, end, err := resolveRange(args.Start, args.End, time.Now().UTC())
	if err != nil {
		return "", err
	}
	step, err := resolveStep(args.Step)
	if err != nil {
		return "", err
	}
	result, err := t.o11y.QueryMetricsRange(ctx, args.Query, start, end, step)
	if err != nil {
		return "", err
	}
	return t.deliver(result), nil
}

const logsDescription = "Run a LogsQL query against the user's service logs. " +
	"The result is automatically restricted to this user — do not add user filters yourself. " +
	"Returns newline-delimited JSON log entries, newest capped by limit; large results are stored and returned as a preview plus a ref for the jq tool."

type logsArgs struct {
	Query string `json:"query" jsonschema:"description=LogsQL query, e.g. _time:24h error"`
	Start string `json:"start,omitempty" jsonschema:"description=Range start as RFC3339 or unix seconds; defaults to 24h ago, capped at 30 days back"`
	End   string `json:"end,omitempty" jsonschema:"description=Range end as RFC3339 or unix seconds; defaults to now"`
	Limit int    `json:"limit,omitempty" jsonschema:"description=Maximum entries to return; defaults to 100, capped at 1000"`
}

func (t *toolbox) queryLogs(ctx context.Context, args logsArgs) (string, error) {
	if err := t.spend("logs: " + args.Query); err != nil {
		return "", err
	}
	start, end, err := resolveRange(args.Start, args.End, time.Now().UTC())
	if err != nil {
		return "", err
	}
	limit := args.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	result, err := t.o11y.QueryLogs(ctx, args.Query, start, end, limit)
	if err != nil {
		return "", err
	}
	return t.deliver(result), nil
}

const jqDescription = "Run a jq program over a stored result (by ref from query_metrics/query_logs). " +
	"Newline-delimited input is processed as a stream of JSON values. Use this to aggregate or slim down large results."

type jqArgs struct {
	Program string `json:"program" jsonschema:"description=jq program, e.g. .data.result | length"`
	Ref     string `json:"ref" jsonschema:"description=Result ref such as r1"`
}

func (t *toolbox) jq(ctx context.Context, args jqArgs) (string, error) {
	if err := t.spend("jq: " + args.Program); err != nil {
		return "", err
	}
	input, ok := t.store.Get(args.Ref)
	if !ok {
		return "", fmt.Errorf("unknown ref %q", args.Ref)
	}
	query, err := gojq.Parse(args.Program)
	if err != nil {
		return "", fmt.Errorf("invalid jq program: %w", err)
	}
	code, err := gojq.Compile(query)
	if err != nil {
		return "", fmt.Errorf("invalid jq program: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, jqTimeout)
	defer cancel()

	var outputs []string
	total := 0
	decoder := json.NewDecoder(strings.NewReader(input))
	for decoder.More() {
		var value any
		if err := decoder.Decode(&value); err != nil {
			return "", fmt.Errorf("input is not JSON: %w", err)
		}
		iter := code.RunWithContext(ctx, value)
		for {
			out, ok := iter.Next()
			if !ok {
				break
			}
			if err, isErr := out.(error); isErr {
				return "", err
			}
			encoded, err := json.Marshal(out)
			if err != nil {
				return "", err
			}
			total += len(encoded) + 1
			if total > maxJqOutputBytes {
				return "", fmt.Errorf("jq output exceeded %d bytes — narrow the program", maxJqOutputBytes)
			}
			outputs = append(outputs, string(encoded))
		}
	}
	return t.deliver(strings.Join(outputs, "\n")), nil
}

func (t *toolbox) deliver(result string) string {
	if len(result) <= t.maxResult {
		return result
	}
	ref := t.store.Put(result)
	return fmt.Sprintf(
		"[result is %d bytes — stored as %s, use the jq tool to process it]\npreview:\n%s",
		len(result), ref, result[:t.maxResult],
	)
}

// resolveRange parses model-supplied bounds and clamps them into
// [now-maxLookback, now] BEFORE the backend sees them: the response cap and
// HTTP timeout only kick in after the storage engine has started the scan,
// so an unbounded multi-year range must never leave the harness.
func resolveRange(start, end string, now time.Time) (string, string, error) {
	floor := now.Add(-maxLookback)
	startAt, err := parseTimeArg(start, now.Add(-24*time.Hour))
	if err != nil {
		return "", "", fmt.Errorf("invalid start: %w", err)
	}
	endAt, err := parseTimeArg(end, now)
	if err != nil {
		return "", "", fmt.Errorf("invalid end: %w", err)
	}
	if startAt.Before(floor) {
		startAt = floor
	}
	if endAt.After(now) {
		endAt = now
	}
	if !endAt.After(startAt) {
		return "", "", fmt.Errorf("end must be after start (lookback is capped at %s)", maxLookback)
	}
	return startAt.Format(time.RFC3339), endAt.Format(time.RFC3339), nil
}

func parseTimeArg(v string, fallback time.Time) (time.Time, error) {
	if v == "" {
		return fallback, nil
	}
	if at, err := time.Parse(time.RFC3339, v); err == nil {
		return at.UTC(), nil
	}
	if seconds, err := strconv.ParseInt(v, 10, 64); err == nil {
		return time.Unix(seconds, 0).UTC(), nil
	}
	return time.Time{}, fmt.Errorf("%q is neither RFC3339 nor unix seconds", v)
}

func resolveStep(v string) (string, error) {
	if v == "" {
		return "5m", nil
	}
	var step time.Duration
	if seconds, err := strconv.ParseInt(v, 10, 64); err == nil {
		step = time.Duration(seconds) * time.Second
	} else if parsed, err := time.ParseDuration(v); err == nil {
		step = parsed
	} else {
		return "", fmt.Errorf("invalid step %q: use a duration such as 5m", v)
	}
	if step < minStep {
		step = minStep
	}
	return fmt.Sprintf("%ds", int64(step.Seconds())), nil
}
