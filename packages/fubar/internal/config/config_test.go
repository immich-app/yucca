package config

import (
	"testing"
	"time"
)

func setHome(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("XDG_CONFIG_HOME", tmp+"/.config")
}

func TestConfigRoundTrip(t *testing.T) {
	setHome(t)

	cfg := &Config{
		API: "http://localhost:3020",
		Plans: []Plan{{
			Name:       "documents",
			Repository: "3f1f0d05-9a48-4a9e-8fb2-6f19f3f5f2aa",
			Paths:      []string{"/home/x/docs"},
			Excludes:   []string{".cache"},
			Cron:       "0 2 * * *",
			KeepDaily:  7,
		}},
	}
	if err := Save(cfg); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.API != cfg.API || len(loaded.Plans) != 1 {
		t.Fatalf("round trip mismatch: %+v", loaded)
	}
	plan, err := loaded.Plan("documents")
	if err != nil {
		t.Fatal(err)
	}
	if plan.Cron != "0 2 * * *" || plan.KeepDaily != 7 {
		t.Fatalf("plan mismatch: %+v", plan)
	}
	if _, err := loaded.Plan("nope"); err == nil {
		t.Fatal("expected error for unknown plan")
	}
}

func TestLoadMissingConfigIsEmpty(t *testing.T) {
	setHome(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Plans) != 0 {
		t.Fatalf("expected empty config, got %+v", cfg)
	}
}

func TestForgetArgs(t *testing.T) {
	plan := &Plan{KeepDaily: 7, KeepMonthly: 6}
	got := plan.ForgetArgs()
	want := []string{"--keep-daily", "7", "--keep-monthly", "6"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	if !plan.HasRetention() {
		t.Fatal("expected retention")
	}
	if (&Plan{}).HasRetention() {
		t.Fatal("expected no retention")
	}
}

func TestTokenNotLoggedIn(t *testing.T) {
	setHome(t)
	if _, err := LoadToken(); err == nil {
		t.Fatal("expected not-logged-in error")
	}
}

func TestStateRecordRun(t *testing.T) {
	setHome(t)
	record := RunRecord{Start: time.Now().Add(-time.Minute), End: time.Now(), Success: true, SnapshotID: "abc"}
	if err := RecordRun("documents", record); err != nil {
		t.Fatal(err)
	}
	state, err := LoadState()
	if err != nil {
		t.Fatal(err)
	}
	if got := state.LastRuns["documents"]; !got.Success || got.SnapshotID != "abc" {
		t.Fatalf("state mismatch: %+v", got)
	}
}
