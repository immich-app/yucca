package o11y

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func recordingServer(t *testing.T, status int, body string) (*httptest.Server, *http.Request, *[]byte) {
	t.Helper()
	var captured http.Request
	var form []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = *r
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		form = []byte(r.Form.Encode())
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &captured, &form
}

func TestQueryMetricsRangeAlwaysScopesToCustomer(t *testing.T) {
	srv, captured, form := recordingServer(t, http.StatusOK, `{"status":"success"}`)
	client := NewClient(srv.URL, srv.URL, "user-1")

	result, err := client.QueryMetricsRange(
		context.Background(),
		`sum(rate(http_requests_total{customerId="someone-else"}[5m]))`,
		"2026-08-26T00:00:00Z", "2026-08-27T00:00:00Z", "5m",
	)
	if err != nil {
		t.Fatal(err)
	}
	if result != `{"status":"success"}` {
		t.Fatalf("unexpected result %q", result)
	}
	if captured.URL.Path != "/api/v1/query_range" {
		t.Fatalf("unexpected path %q", captured.URL.Path)
	}
	if got := formValue(t, *form, "extra_label"); got != "customerId=user-1" {
		t.Fatalf("extra_label = %q, want customerId=user-1", got)
	}
}

func TestQueryLogsWrapsQueryInCustomerFilter(t *testing.T) {
	srv, captured, form := recordingServer(t, http.StatusOK, "{}")
	client := NewClient(srv.URL, srv.URL, "user-1")

	if _, err := client.QueryLogs(context.Background(), `error or customerId:="someone-else"`, "0", "1", 10); err != nil {
		t.Fatal(err)
	}
	if captured.URL.Path != "/select/logsql/query" {
		t.Fatalf("unexpected path %q", captured.URL.Path)
	}
	want := `(user:="user-1" or customerId:="user-1") and (error or customerId:="someone-else")`
	if got := formValue(t, *form, "query"); got != want {
		t.Fatalf("query = %q, want %q", got, want)
	}
}

func TestScopeLogsQLSplitsPipes(t *testing.T) {
	scoped, err := scopeLogsQL("user-1", `_time:24h | sort by (_time) desc | limit 10`)
	if err != nil {
		t.Fatal(err)
	}
	want := `(user:="user-1" or customerId:="user-1") and (_time:24h) | sort by (_time) desc | limit 10`
	if scoped != want {
		t.Fatalf("scoped = %q, want %q", scoped, want)
	}
}

func TestScopeLogsQLIgnoresQuotedPipes(t *testing.T) {
	scoped, err := scopeLogsQL("user-1", `_msg:"a|b" error`)
	if err != nil {
		t.Fatal(err)
	}
	want := `(user:="user-1" or customerId:="user-1") and (_msg:"a|b" error)`
	if scoped != want {
		t.Fatalf("scoped = %q, want %q", scoped, want)
	}
}

func TestScopeLogsQLDefaultsEmptyFilter(t *testing.T) {
	scoped, err := scopeLogsQL("user-1", `| stats count()`)
	if err != nil {
		t.Fatal(err)
	}
	want := `(user:="user-1" or customerId:="user-1") and (*) | stats count()`
	if scoped != want {
		t.Fatalf("scoped = %q, want %q", scoped, want)
	}
}

func TestScopeLogsQLRejectsJoinAndUnion(t *testing.T) {
	for _, query := range []string{
		`error | join by (request_id) (customerId:="someone-else")`,
		`error | union(customerId:="someone-else")`,
		`error | UNION (whatever)`,
	} {
		if _, err := scopeLogsQL("user-1", query); err == nil {
			t.Fatalf("expected %q to be rejected", query)
		}
	}
}

func TestQueryFleetRangeIsUnscoped(t *testing.T) {
	srv, captured, form := recordingServer(t, http.StatusOK, `{"status":"success"}`)
	client := NewClient(srv.URL, srv.URL, "user-1")

	if _, err := client.QueryFleetRange(context.Background(), "ceph_health_status", "0", "1", "5m"); err != nil {
		t.Fatal(err)
	}
	if captured.URL.Path != "/api/v1/query_range" {
		t.Fatalf("unexpected path %q", captured.URL.Path)
	}
	if got := formValue(t, *form, "extra_label"); got != "" {
		t.Fatalf("extra_label = %q, want none on the fleet path", got)
	}
	if got := formValue(t, *form, "query"); got != "ceph_health_status" {
		t.Fatalf("query = %q", got)
	}
}

func TestMetricNamesIsScopedToCustomer(t *testing.T) {
	srv, captured, form := recordingServer(t, http.StatusOK, `{"status":"success","data":["api_request_count","blobs.uploaded_bytes"]}`)
	client := NewClient(srv.URL, srv.URL, "user-1")

	names, err := client.MetricNames(context.Background(), 30*24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if captured.URL.Path != "/api/v1/label/__name__/values" {
		t.Fatalf("unexpected path %q", captured.URL.Path)
	}
	if got := formValue(t, *form, "extra_label"); got != "customerId=user-1" {
		t.Fatalf("extra_label = %q, want customerId=user-1", got)
	}
	if len(names) != 2 || names[1] != "blobs.uploaded_bytes" {
		t.Fatalf("names = %v", names)
	}
}

func TestOversizedResponseIsRejected(t *testing.T) {
	srv, _, _ := recordingServer(t, http.StatusOK, strings.Repeat("x", maxResponseBytes+1))
	client := NewClient(srv.URL, srv.URL, "user-1")

	_, err := client.QueryLogs(context.Background(), "*", "0", "1", 1000)
	if err == nil || !strings.Contains(err.Error(), "response exceeded") {
		t.Fatalf("expected a truncation error, got %v", err)
	}
}

func TestQueryErrorSurfacesStatusAndBody(t *testing.T) {
	srv, _, _ := recordingServer(t, http.StatusUnprocessableEntity, "cannot parse query")
	client := NewClient(srv.URL, srv.URL, "user-1")

	_, err := client.QueryLogs(context.Background(), "(((", "0", "1", 10)
	if err == nil {
		t.Fatal("expected an error")
	}
	if got := err.Error(); got != "query failed with status 422: cannot parse query" {
		t.Fatalf("unexpected error %q", got)
	}
}

func formValue(t *testing.T, encoded []byte, key string) string {
	t.Helper()
	values, err := url.ParseQuery(string(encoded))
	if err != nil {
		t.Fatal(err)
	}
	return values.Get(key)
}
