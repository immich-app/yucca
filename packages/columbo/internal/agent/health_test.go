package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"columbo/internal/o11y"
)

func TestHealthProbeRegistryIsWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range healthProbes {
		if p.name == "" || p.description == "" || p.query == "" {
			t.Fatalf("incomplete probe %+v", p)
		}
		if seen[p.name] {
			t.Fatalf("duplicate probe name %q", p.name)
		}
		seen[p.name] = true
		if !strings.Contains(healthDescription(), p.name) {
			t.Fatalf("probe %q missing from the tool description", p.name)
		}
	}
}

func TestQueryHealthRejectsUnknownProbe(t *testing.T) {
	box := testBox(4, 1024)
	_, err := box.queryHealth(context.Background(), healthArgs{Probe: "drop_tables"})
	if err == nil || !strings.Contains(err.Error(), "unknown probe") {
		t.Fatalf("expected an unknown-probe error, got %v", err)
	}
	if box.callsMade() != 0 {
		t.Fatal("an unknown probe must not consume the tool budget")
	}
}

func TestQueryHealthRunsTheRegistryQueryUnscoped(t *testing.T) {
	var form url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		form = r.Form
		_, _ = w.Write([]byte(`{"status":"success"}`))
	}))
	t.Cleanup(srv.Close)

	box := newToolbox(o11y.NewClient(srv.URL, srv.URL, "user-1"), NewResultStore(), 4, 1024)
	out, err := box.queryHealth(context.Background(), healthArgs{Probe: "backend_health"})
	if err != nil {
		t.Fatal(err)
	}
	if out != `{"status":"success"}` {
		t.Fatalf("out = %q", out)
	}
	probe, _ := healthProbeByName("backend_health")
	if got := form.Get("query"); got != probe.query {
		t.Fatalf("query = %q, want the registry query %q", got, probe.query)
	}
	if _, scoped := form["extra_label"]; scoped {
		t.Fatal("health probes must not carry the per-user extra_label")
	}
	if got := box.queriesRun(); len(got) != 1 || got[0] != "health: backend_health" {
		t.Fatalf("queriesRun = %v", got)
	}
}
