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
	"github.com/rs/zerolog"
)

const (
	jqTimeout        = 10 * time.Second
	maxJqOutputBytes = 4 << 20
	maxLookback      = 30 * 24 * time.Hour
	minStep          = time.Minute
)

var errToolBudget = errors.New("tool budget exhausted — write your conclusion with what you have")

// toolbox is the complete capability surface the model gets: three read-only
// queries pre-scoped to one user — metrics and service logs by customerId,
// the Ceph gateway log by the account's own bucket set — plus a fixed-probe
// fleet-health check and an in-process jq over stored results. No tool takes
// a URL, a header, or a credential.
type toolbox struct {
	o11y  *o11y.Client
	store *ResultStore

	mu        sync.Mutex
	calls     int
	maxCalls  int
	maxResult int
	queries   []string

	bucketsOnce sync.Once
	buckets     []string
	bucketsErr  error
}

func newToolbox(client *o11y.Client, store *ResultStore, maxCalls, maxResult int) *toolbox {
	return &toolbox{o11y: client, store: store, maxCalls: maxCalls, maxResult: maxResult}
}

func (t *toolbox) tools() ([]tool.BaseTool, error) {
	metrics, err := utils.InferTool("query_metrics", metricsDescription, audited("query_metrics", t.queryMetrics))
	if err != nil {
		return nil, err
	}
	logs, err := utils.InferTool("query_logs", logsDescription, audited("query_logs", t.queryLogs))
	if err != nil {
		return nil, err
	}
	rgw, err := utils.InferTool("query_rgw_logs", rgwLogsDescription, audited("query_rgw_logs", t.queryRGWLogs))
	if err != nil {
		return nil, err
	}
	health, err := utils.InferTool("query_health", healthDescription(), audited("query_health", t.queryHealth))
	if err != nil {
		return nil, err
	}
	jq, err := utils.InferTool("jq", jqDescription, audited("jq", t.jq))
	if err != nil {
		return nil, err
	}
	// Tool failures (a bad query, an exhausted budget) become tool RESULTS,
	// not run failures: the model gets the error text and can correct itself
	// instead of the whole investigation dying on a syntax error. MaxStep
	// still bounds a model that never recovers.
	wrapped := make([]tool.BaseTool, 0, 5)
	for _, t := range []tool.BaseTool{metrics, logs, rgw, health, jq} {
		wrapped = append(wrapped, utils.WrapToolWithErrorHandler(t, func(_ context.Context, err error) string {
			return "ERROR: " + err.Error()
		}))
	}
	return wrapped, nil
}

func audited[T any](name string, fn func(context.Context, T) (string, error)) func(context.Context, T) (string, error) {
	return func(ctx context.Context, args T) (string, error) {
		started := time.Now()
		result, err := fn(ctx, args)
		event := zerolog.Ctx(ctx).Info().
			Str("audit", "tool_call").
			Str("tool", name).
			Interface("args", args).
			Dur("durationMs", time.Since(started))
		if err != nil {
			event = event.Str("error", err.Error())
		} else {
			event = event.Int("resultBytes", len(result)).Str("result", result)
		}
		event.Msg("columbo audit: tool call")
		return result, err
	}
}

func (t *toolbox) queriesRun() []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return append([]string(nil), t.queries...)
}

// availableMetrics is the free (no tool budget) prefetch of which metric
// names carry data for this user; nil means the lookup failed and the model
// is told to discover instead.
func (t *toolbox) availableMetrics(ctx context.Context) []string {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	names, err := t.o11y.MetricNames(ctx, 30*24*time.Hour)
	if err != nil {
		zerolog.Ctx(ctx).Warn().Err(err).Msg("metric-name prefetch failed")
		return nil
	}
	if names == nil {
		names = []string{}
	}
	return names
}

// clientTelemetry is the free (no tool budget) prefetch of what this user's
// own backup client reported home; nil means the lookup failed and the model
// is told to query instead.
func (t *toolbox) clientTelemetry(ctx context.Context) []o11y.ClientEvent {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	events, err := t.o11y.ClientTelemetry(ctx, maxLookback)
	if err != nil {
		zerolog.Ctx(ctx).Warn().Err(err).Msg("client-telemetry prefetch failed")
		return nil
	}
	if events == nil {
		events = []o11y.ClientEvent{}
	}
	return events
}

func (t *toolbox) callsMade() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.calls
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

const rgwLogsDescription = "Run a LogsQL query against the Ceph object-gateway (RGW) access log for THIS USER'S buckets only. " +
	"This is the storage tier's own record of the same requests michael serves, so it settles whether a write actually reached Ceph and what Ceph answered. " +
	"Every line is pre-filtered to buckets this account owns and pre-parsed into the fields op, bucket, status (Ceph code, 0 = ok), http_status, latency (seconds) and request_id — " +
	"your query filters on those extracted fields, so write it as a plain expression such as `http_status:!=\"200\"` or `op:=\"put_obj\"`, and leave it empty to see everything. " +
	"Pipes work: `| stats by (op, http_status) count() c`. Do not add bucket or user filters yourself."

type rgwLogsArgs struct {
	Query string `json:"query,omitempty" jsonschema:"description=Filter over the extracted fields (op/bucket/status/http_status/latency/request_id); empty means no filter"`
	Start string `json:"start,omitempty" jsonschema:"description=Range start as RFC3339 or unix seconds; defaults to 24h ago, capped at 30 days back"`
	End   string `json:"end,omitempty" jsonschema:"description=Range end as RFC3339 or unix seconds; defaults to now"`
	Limit int    `json:"limit,omitempty" jsonschema:"description=Maximum entries to return; defaults to 100, capped at 1000"`
}

func (t *toolbox) queryRGWLogs(ctx context.Context, args rgwLogsArgs) (string, error) {
	if err := t.spend("rgw: " + args.Query); err != nil {
		return "", err
	}
	buckets, err := t.scopedBuckets(ctx)
	if err != nil {
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
	result, err := t.o11y.QueryRGWLogs(ctx, buckets, args.Query, start, end, limit)
	if err != nil {
		return "", err
	}
	return t.deliver(result), nil
}

// scopedBuckets resolves the account's bucket names once per investigation.
// It is the whole security boundary for the RGW tool — the gateway's logs
// carry no per-user field — so it is deliberately not something the model can
// influence, and a lookup failure fails the tool closed rather than falling
// back to an unscoped read.
func (t *toolbox) scopedBuckets(ctx context.Context) ([]string, error) {
	t.bucketsOnce.Do(func() {
		t.buckets, t.bucketsErr = t.o11y.RepositoryIDs(ctx, maxLookback)
	})
	if t.bucketsErr != nil {
		return nil, fmt.Errorf("could not resolve this account's buckets, refusing to query the gateway log unscoped: %w", t.bucketsErr)
	}
	return t.buckets, nil
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
