package cli

import (
	"strings"
	"testing"
)

func setHome(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("XDG_CONFIG_HOME", tmp+"/.config")
}

func TestNextRun(t *testing.T) {
	if got := nextRun(""); got != "manual" {
		t.Fatalf("expected manual, got %q", got)
	}
	if got := nextRun("not a cron"); got != "invalid cron" {
		t.Fatalf("expected invalid, got %q", got)
	}
	if got := nextRun("0 2 * * *"); !strings.Contains(got, ":") {
		t.Fatalf("expected a timestamp, got %q", got)
	}
}

func TestPlanLockSingleFlight(t *testing.T) {
	setHome(t)

	release, err := planLock("docs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := planLock("docs"); err == nil {
		t.Fatal("expected second lock to fail while held")
	}
	release()
	release2, err := planLock("docs")
	if err != nil {
		t.Fatalf("expected lock after release, got %v", err)
	}
	release2()
}

func TestRootCommandTree(t *testing.T) {
	root := NewRootCmd()
	for _, name := range []string{"login", "init", "backup", "snapshots", "restore", "forget", "status", "daemon", "service", "doctor"} {
		found := false
		for _, c := range root.Commands() {
			if c.Name() == name {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing command %q", name)
		}
	}
}
