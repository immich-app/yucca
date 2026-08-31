package agent

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/cloudwego/eino/components/tool"
)

func testBox(maxCalls, maxResult int) *toolbox {
	return newToolbox(nil, NewResultStore(), maxCalls, maxResult)
}

func TestToolBudgetIsEnforced(t *testing.T) {
	box := testBox(1, 1024)
	if err := box.spend("one"); err != nil {
		t.Fatal(err)
	}
	if err := box.spend("two"); err == nil {
		t.Fatal("expected the budget to be exhausted")
	}
	if got := box.queriesRun(); len(got) != 1 || got[0] != "one" {
		t.Fatalf("queriesRun = %v", got)
	}
}

func TestDeliverStoresLargeResults(t *testing.T) {
	box := testBox(4, 10)
	large := strings.Repeat("x", 100)
	out := box.deliver(large)
	if !strings.Contains(out, "stored as r1") {
		t.Fatalf("expected a stored ref, got %q", out)
	}
	stored, ok := box.store.Get("r1")
	if !ok || stored != large {
		t.Fatal("full result was not stored")
	}
	if small := box.deliver("small"); small != "small" {
		t.Fatalf("small result was mangled: %q", small)
	}
}

func TestJqProcessesNewlineDelimitedJSON(t *testing.T) {
	box := testBox(4, 1024)
	ref := box.store.Put(`{"level":"error","n":1}` + "\n" + `{"level":"info","n":2}`)
	out, err := box.jq(context.Background(), jqArgs{Program: `select(.level=="error") | .n`, Ref: ref})
	if err != nil {
		t.Fatal(err)
	}
	if out != "1" {
		t.Fatalf("jq output = %q, want 1", out)
	}
}

func TestJqOutputIsBounded(t *testing.T) {
	box := testBox(4, 1024)
	ref := box.store.Put(`{}`)
	_, err := box.jq(context.Background(), jqArgs{Program: `"ab" * 3000000`, Ref: ref})
	if err == nil || !strings.Contains(err.Error(), "jq output exceeded") {
		t.Fatalf("expected an output-bound error, got %v", err)
	}
}

func TestResolveRangeClampsToMaxLookback(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)

	start, end, err := resolveRange("0", "", now)
	if err != nil {
		t.Fatal(err)
	}
	if start != now.Add(-maxLookback).Format(time.RFC3339) {
		t.Fatalf("start = %q, want the lookback floor", start)
	}
	if end != now.Format(time.RFC3339) {
		t.Fatalf("end = %q, want now", end)
	}

	if _, _, err := resolveRange("yesterday-ish", "", now); err == nil {
		t.Fatal("expected an error for an unparseable start")
	}
	if _, _, err := resolveRange("", "0", now); err == nil {
		t.Fatal("expected an error when the clamped range is empty")
	}
}

func TestResolveStepEnforcesMinimum(t *testing.T) {
	step, err := resolveStep("1ms")
	if err != nil {
		t.Fatal(err)
	}
	if step != "60s" {
		t.Fatalf("step = %q, want 60s", step)
	}
	if step, _ := resolveStep("300"); step != "300s" {
		t.Fatalf("step = %q, want 300s", step)
	}
	if _, err := resolveStep("often"); err == nil {
		t.Fatal("expected an error for an unparseable step")
	}
}

func TestJqRejectsUnknownRef(t *testing.T) {
	box := testBox(4, 1024)
	if _, err := box.jq(context.Background(), jqArgs{Program: ".", Ref: "r99"}); err == nil {
		t.Fatal("expected an unknown-ref error")
	}
}

func TestToolErrorsBecomeToolResults(t *testing.T) {
	box := testBox(4, 1024)
	tools, err := box.tools()
	if err != nil {
		t.Fatal(err)
	}
	jq := tools[3].(interface {
		InvokableRun(ctx context.Context, argumentsInJSON string, opts ...tool.Option) (string, error)
	})
	out, err := jq.InvokableRun(context.Background(), `{"program":".","ref":"r99"}`)
	if err != nil {
		t.Fatalf("tool error leaked as a run error: %v", err)
	}
	if !strings.Contains(out, "ERROR:") || !strings.Contains(out, "unknown ref") {
		t.Fatalf("out = %q", out)
	}
}

func TestAvailableMetricsLine(t *testing.T) {
	if got := availableMetricsLine(nil); !strings.Contains(got, "lookup unavailable") {
		t.Fatalf("nil case = %q", got)
	}
	if got := availableMetricsLine([]string{}); !strings.Contains(got, "none — this account has produced no metrics") {
		t.Fatalf("empty case = %q", got)
	}
	if got := availableMetricsLine([]string{"api_request_count", "blobs.uploaded_bytes"}); !strings.Contains(got, "api_request_count, blobs.uploaded_bytes") {
		t.Fatalf("listing case = %q", got)
	}
}

func TestParseTriage(t *testing.T) {
	verdict, err := parseTriage("Sure thing!\n{\"investigate\": true, \"reason\": \"backup errors\"}\n")
	if err != nil {
		t.Fatal(err)
	}
	if !verdict.Investigate || verdict.Reason != "backup errors" {
		t.Fatalf("verdict = %+v", verdict)
	}
	if _, err := parseTriage("no json here"); err == nil {
		t.Fatal("expected a parse error")
	}
}

func TestTruncateNote(t *testing.T) {
	long := strings.Repeat("a", maxNoteChars+100)
	if got := truncateNote(long); len(got) > maxNoteChars+len("…") {
		t.Fatalf("note not truncated: %d chars", len(got))
	}
	if got := truncateNote("short"); got != "short" {
		t.Fatalf("short note mangled: %q", got)
	}
}
