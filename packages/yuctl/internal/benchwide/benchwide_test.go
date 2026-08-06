package benchwide

import (
	"regexp"
	"strings"
	"testing"
)

func TestDropletName(t *testing.T) {
	s := &Session{Partition: "staging", providerName: "do"}
	if got := s.dropletName(7); got != "yucca-bench-do-staging-07" {
		t.Fatalf("dropletName = %q", got)
	}
	if got := s.Tag(); got != "yuctl-bench-do-staging" {
		t.Fatalf("Tag = %q", got)
	}
}

// Kill patterns must match their targets but never the kill script's own shell
// (its command line contains the pattern) — self-match SIGTERMs the exec. Same
// bracket trick as warp.
func TestKillScriptNoSelfMatch(t *testing.T) {
	re := regexp.MustCompile(`bench-agent --[l]oadgen`)
	if !re.MatchString("/root/.cache/yuctl-bench/bin/bench-agent --loadgen /var/tmp/yucca-bench-do/loadgen.json") {
		t.Fatal("pattern must match the real agent command line")
	}
	if re.MatchString(killScript) {
		t.Fatal("pattern must not match the kill script itself")
	}
}

func TestParseSample(t *testing.T) {
	out := `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  1000     10    0    0    0     0          0         0     1000     10    0    0    0     0       0          0
  eth0: 500000   100    0    0    0     0          0         0   900000    200    0    0    0     0       0          0
---S1---
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  2000     10    0    0    0     0          0         0     2000     10    0    0    0     0       0          0
  eth0: 600000   100    0    0    0     0          0         0  1900000    200    0    0    0     0       0          0
---S2---
{"startedAt":"2026-07-28T10:00:00Z","updatedAt":"2026-07-28T10:05:00Z","state":"running","capBytes":4000000000000,"wireTxBytes":123,"clients":[{"name":"yucca-bench-do-prod-01-c1","phase":"backup","cycles":3,"uploaded":456}]}
---S3---
1 2
`
	ds := DropletStatus{}
	parseSample(out, 5, &ds)
	if ds.TxBps != float64(1900000-900000)*8/5 {
		t.Fatalf("TxBps = %v", ds.TxBps)
	}
	if ds.RxBps != float64(600000-500000)*8/5 {
		t.Fatalf("RxBps = %v", ds.RxBps)
	}
	if ds.Status == nil || ds.Status.State != "running" || ds.Status.WireTxBytes != 123 {
		t.Fatalf("Status = %+v", ds.Status)
	}
	if len(ds.Status.Clients) != 1 || ds.Status.Clients[0].Cycles != 3 {
		t.Fatalf("Clients = %+v", ds.Status.Clients)
	}
	if ds.AgentProcs != 1 || ds.ResticProcs != 2 {
		t.Fatalf("procs = %d/%d", ds.AgentProcs, ds.ResticProcs)
	}
}

func TestParseSampleMissingStatus(t *testing.T) {
	out := "x---S1---y---S2---\n\n---S3---\n0 0\n"
	ds := DropletStatus{}
	parseSample(out, 5, &ds)
	if ds.Status != nil {
		t.Fatalf("expected nil status, got %+v", ds.Status)
	}
	if ds.AgentProcs != 0 || ds.ResticProcs != 0 {
		t.Fatalf("procs = %d/%d", ds.AgentProcs, ds.ResticProcs)
	}
}

func TestStartOptionsDefaults(t *testing.T) {
	o := StartOptions{}
	o.defaults()
	if o.ClientsPerDroplet != 1 || o.PackSizeMiB != 16 || o.CycleSize != 8<<30 || o.Seed == 0 {
		t.Fatalf("defaults = %+v", o)
	}
	if o.Label != "run" || o.Compression != "off" {
		t.Fatalf("defaults = %+v", o)
	}
}

// prep and launch must stay separate execs: combined, prep's pkill would match
// launch's verbatim "bench-agent --loadgen" on its own shell and SIGTERM it
// mid-script (config written, agent never started). Guard both halves.
func TestPrepAndLaunchScriptsSeparated(t *testing.T) {
	prep, launch := prepScript(), launchScript()
	if !strings.Contains(prep, "cat > "+configPath) {
		t.Fatalf("prep must read the config from stdin into %s:\n%s", configPath, prep)
	}
	if !strings.Contains(prep, killScript) {
		t.Fatal("prep must kill the previous load")
	}
	killPattern := regexp.MustCompile(`bench-agent --[l]oadgen`)
	if killPattern.MatchString(prep) {
		t.Fatalf("prep's own command line must not match the kill pattern:\n%s", prep)
	}
	if !strings.Contains(launch, "--loadgen "+configPath) {
		t.Fatal("launch must start the agent from the config file")
	}
	if strings.Contains(launch, "pkill") {
		t.Fatalf("launch must not run kills — its command line matches the kill pattern:\n%s", launch)
	}
	if !killPattern.MatchString(launch) {
		t.Fatal("sanity: the agent command line must be killable by the pattern")
	}
}
