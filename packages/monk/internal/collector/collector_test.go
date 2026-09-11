package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

const day = 24 * time.Hour

var testIntervals = Intervals{
	Global: map[Depth]time.Duration{Shallow: 7 * day, Deep: 28 * day},
	Scheduler: Policy{
		Interval: map[Depth]time.Duration{Shallow: day, Deep: 28 * day},
		Ratio:    map[Depth]float64{Shallow: 0.5, Deep: 0.2},
	},
	Health: Policy{
		Interval: map[Depth]time.Duration{Shallow: 7 * day, Deep: 28 * day},
		Ratio:    map[Depth]float64{Shallow: 0.5, Deep: 0.75},
	},
}

func testNow(t *testing.T) time.Time {
	t.Helper()
	now, err := time.Parse(time.RFC3339, "2026-09-01T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	return now
}

func loadFixture(t *testing.T) []byte {
	t.Helper()
	raw, err := os.ReadFile("testdata/pg_ls.json")
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestComputeAgainstBruteForce(t *testing.T) {
	raw := loadFixture(t)
	now := testNow(t)
	snap, err := Compute(raw, now, testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	if snap.ParseErrors != 0 {
		t.Fatalf("parse errors on fixture: %d", snap.ParseErrors)
	}

	var data pgLs
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	totalPGs, totalBytes := 0, int64(0)
	overdue := map[Depth]int{}
	for _, pg := range data.PGStats {
		totalPGs++
		totalBytes += pg.StatSum.NumBytes
		for depth, s := range map[Depth]string{Shallow: pg.LastScrubStamp, Deep: pg.LastDeepScrubStamp} {
			stamp, err := time.Parse(stampLayout, s)
			if err != nil {
				t.Fatalf("fixture stamp %q: %v", s, err)
			}
			if now.Sub(stamp) > testIntervals.Global[depth] {
				overdue[depth]++
			}
		}
	}

	gotPGs, gotBytes := 0, int64(0)
	gotOverdue := map[Depth]int{}
	for _, ps := range snap.Pools {
		gotPGs += ps.PGs
		gotBytes += ps.Bytes
		for _, d := range Depths {
			gotOverdue[d] += ps.OverduePGs[d]
		}
	}
	if gotPGs != totalPGs || gotBytes != totalBytes {
		t.Errorf("totals: got %d PGs / %d bytes, want %d / %d", gotPGs, gotBytes, totalPGs, totalBytes)
	}
	for _, d := range Depths {
		if gotOverdue[d] != overdue[d] {
			t.Errorf("overdue[%s]: got %d, want %d", d, gotOverdue[d], overdue[d])
		}
	}
}

func TestAgeBucketsCumulative(t *testing.T) {
	snap, err := Compute(loadFixture(t), testNow(t), testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	for pool, ps := range snap.Pools {
		for _, d := range Depths {
			buckets := ps.AgeBucketBytes[d]
			for i := 1; i < len(buckets); i++ {
				if buckets[i] < buckets[i-1] {
					t.Errorf("pool %s %s: bucket %d (%d) < bucket %d (%d)", pool, d, i, buckets[i], i-1, buckets[i-1])
				}
			}
			if last := buckets[len(buckets)-1]; last > ps.Bytes {
				t.Errorf("pool %s %s: largest bucket %d exceeds pool bytes %d", pool, d, last, ps.Bytes)
			}
		}
	}
}

func TestScheduleState(t *testing.T) {
	cases := map[string]string{
		"periodic scrub scheduled @ 2026-08-29T02:13:18.699625+0000":      "scheduled",
		"periodic deep scrub scheduled @ 2026-09-12T01:00:00.000000+0000": "scheduled",
		"queued for deep scrub":                   "queued",
		"deep scrubbing for 123s":                 "scrubbing",
		"Blocked! locked objects (for 5s)":        "blocked",
		"Reserving. Waiting 3s for OSD.12 (2/20)": "reserving",
		"no scrub is scheduled":                   "none",
		"--":                                      "none",
		"":                                        "none",
		"user requested, deferred until 2026-09-01": "other",
	}
	for in, want := range cases {
		if got := scheduleState(in); got != want {
			t.Errorf("scheduleState(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestComputeRejectsEmpty(t *testing.T) {
	if _, err := Compute([]byte(`{"pg_stats": []}`), testNow(t), testIntervals); err == nil {
		t.Error("empty pg_stats should error, not report zero work outstanding")
	}
}

func TestComputeCountsUnparsableStampsOverdue(t *testing.T) {
	now := testNow(t)
	goodStamp, err := time.Parse(stampLayout, "2026-08-31T00:00:00.000000+0000")
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte(`{"pg_stats": [
		{"pgid": "7.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "7.b", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "7.c", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "7.d", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "7.e", "last_scrub_stamp": "", "last_deep_scrub_stamp": "", "stat_sum": {"num_bytes": 40}}
	]}`)
	snap, err := Compute(raw, now, testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	if snap.ParseErrors != 2 {
		t.Errorf("ParseErrors: got %d, want 2", snap.ParseErrors)
	}
	ps := snap.Pools["7"]
	if ps == nil {
		t.Fatal("pool 7 missing")
	}
	if ps.PGs != 5 || ps.Bytes != 440 {
		t.Errorf("pool totals: got %d PGs / %d bytes, want 5 / 440", ps.PGs, ps.Bytes)
	}
	for _, d := range Depths {
		if ps.OverduePGs[d] != 1 {
			t.Errorf("OverduePGs[%s]: got %d, want 1", d, ps.OverduePGs[d])
		}
		if ps.OverdueBytes[d] != 40 {
			t.Errorf("OverdueBytes[%s]: got %d, want 40", d, ps.OverdueBytes[d])
		}
		if ps.LatePGs[d] != 0 {
			t.Errorf("LatePGs[%s]: got %d, want 0", d, ps.LatePGs[d])
		}
		if ps.BreachPGs[d] != 0 {
			t.Errorf("BreachPGs[%s]: got %d, want 0", d, ps.BreachPGs[d])
		}
		if ps.BreachBytes[d] != 0 {
			t.Errorf("BreachBytes[%s]: got %d, want 0", d, ps.BreachBytes[d])
		}
		if !ps.OldestStamp[d].Equal(goodStamp) {
			t.Errorf("OldestStamp[%s]: got %v, want %v", d, ps.OldestStamp[d], goodStamp)
		}
		for i, b := range ps.AgeBucketBytes[d] {
			if b != 400 {
				t.Errorf("AgeBucketBytes[%s][%d]: got %d, want 400", d, i, b)
			}
		}
	}
}

func TestComputeClampsNegativeBytes(t *testing.T) {
	raw := []byte(`{"pg_stats": [
		{"pgid": "7.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "7.b", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": -50}}
	]}`)
	snap, err := Compute(raw, testNow(t), testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	ps := snap.Pools["7"]
	if ps.Bytes != 100 {
		t.Errorf("Bytes: got %d, want 100 (negative clamped)", ps.Bytes)
	}
	for _, d := range Depths {
		if ps.ParsedBytes[d] != 100 {
			t.Errorf("ParsedBytes[%s]: got %d, want 100", d, ps.ParsedBytes[d])
		}
		for i, b := range ps.AgeBucketBytes[d] {
			if b < 0 || b > 100 {
				t.Errorf("AgeBucketBytes[%s][%d] escaped the clamp: %d", d, i, b)
			}
		}
	}
}

func TestComputeFailsOnCorrelatedParseErrors(t *testing.T) {
	raw := []byte(`{"pg_stats": [
		{"pgid": "7.a", "last_scrub_stamp": "", "last_deep_scrub_stamp": "", "stat_sum": {"num_bytes": 100}},
		{"pgid": "7.b", "last_scrub_stamp": "", "last_deep_scrub_stamp": "", "stat_sum": {"num_bytes": 100}}
	]}`)
	if _, err := Compute(raw, testNow(t), testIntervals); err == nil {
		t.Error("a cluster-wide stamp-format change must read as an outage, not as everything overdue")
	}
}

func TestExporterExpiresSnapshotAfterConsecutiveFailures(t *testing.T) {
	snap, err := Compute(loadFixture(t), testNow(t), testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	exporter := &Exporter{}
	exporter.Store(snap, time.Second)
	if n := testutil.CollectAndCount(exporter, "ceph_scrub_pool_bytes"); n == 0 {
		t.Fatal("pool series missing after Store")
	}
	for range expireAfterFailures {
		exporter.MarkFailed()
	}
	if n := testutil.CollectAndCount(exporter, "ceph_scrub_pool_bytes"); n != 0 {
		t.Errorf("pool series still served after %d consecutive failures: %d", expireAfterFailures, n)
	}
	if n := testutil.CollectAndCount(exporter, "ceph_scrub_collect_success"); n != 1 {
		t.Errorf("health series must survive expiry, got %d", n)
	}
}

func TestExporterMetricSurface(t *testing.T) {
	now := testNow(t)
	deepStamp, err := time.Parse(stampLayout, "2026-07-01T00:00:00.000000+0000")
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte(`{"pg_stats": [
		{"pgid": "7.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-01T00:00:00.000000+0000", "scrub_schedule": "periodic scrub scheduled @ 2026-09-02T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}}
	]}`)
	snap, err := Compute(raw, now, testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	exporter := &Exporter{}
	exporter.Store(snap, time.Second)

	if problems, err := testutil.CollectAndLint(exporter); err != nil || len(problems) > 0 {
		t.Fatalf("lint: %v %v", problems, err)
	}

	expected := fmt.Sprintf(`
# HELP ceph_pg_last_deep_scrub_stamp Oldest per-PG last_deep_scrub_stamp in the pool (seconds since epoch)
# TYPE ceph_pg_last_deep_scrub_stamp gauge
ceph_pg_last_deep_scrub_stamp{pool_id="7"} %g
# HELP ceph_scrub_collect_success Whether the last pg ls collection succeeded
# TYPE ceph_scrub_collect_success gauge
ceph_scrub_collect_success 1
# HELP ceph_scrub_overdue_bytes Bytes in PGs whose last scrub at this depth is older than the target interval
# TYPE ceph_scrub_overdue_bytes gauge
ceph_scrub_overdue_bytes{depth="deep",pool_id="7"} 100
ceph_scrub_overdue_bytes{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_latest_target_seconds Top of ceph's randomized scheduling window (scheduled_at) for a PG in this pool at this depth; a PG older than this was delayed past every target ceph could have drawn
# TYPE ceph_scrub_latest_target_seconds gauge
ceph_scrub_latest_target_seconds{depth="deep",pool_id="7"} 3.38688e+06
ceph_scrub_latest_target_seconds{depth="shallow",pool_id="7"} 129600
# HELP ceph_scrub_late_pgs PGs whose last scrub at this depth is older than ceph's latest scheduling target
# TYPE ceph_scrub_late_pgs gauge
ceph_scrub_late_pgs{depth="deep",pool_id="7"} 1
ceph_scrub_late_pgs{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_late_bytes Bytes in PGs whose last scrub at this depth is older than ceph's latest scheduling target
# TYPE ceph_scrub_late_bytes gauge
ceph_scrub_late_bytes{depth="deep",pool_id="7"} 100
ceph_scrub_late_bytes{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_late_max_seconds How far past ceph's latest scheduling target the oldest PG at this depth is, 0 if none
# TYPE ceph_scrub_late_max_seconds gauge
ceph_scrub_late_max_seconds{depth="deep",pool_id="7"} 1.96992e+06
ceph_scrub_late_max_seconds{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_breach_pgs PGs past the mgr's not-scrubbed warning deadline at this depth; absent while that check is disabled
# TYPE ceph_scrub_breach_pgs gauge
ceph_scrub_breach_pgs{depth="deep",pool_id="7"} 1
ceph_scrub_breach_pgs{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_target_interval_seconds Scrub target interval the pool's overdue numbers were judged against
# TYPE ceph_scrub_target_interval_seconds gauge
ceph_scrub_target_interval_seconds{depth="deep",pool_id="7"} 2.4192e+06
ceph_scrub_target_interval_seconds{depth="shallow",pool_id="7"} 604800
# HELP ceph_scrub_warn_interval_seconds Age past which the mgr raises PG_NOT_SCRUBBED / PG_NOT_DEEP_SCRUBBED for this pool and depth: interval (pool scrub_max_interval / deep_scrub_interval if > 0, else the mgr's osd_scrub_max_interval / osd_deep_scrub_interval) x (1 + the mgr's mon_warn_pg_not_*scrubbed_ratio); absent while that ratio is 0, which disables the check
# TYPE ceph_scrub_warn_interval_seconds gauge
ceph_scrub_warn_interval_seconds{depth="deep",pool_id="7"} 4.2336e+06
ceph_scrub_warn_interval_seconds{depth="shallow",pool_id="7"} 907200
`, float64(deepStamp.UnixMicro())/1e6)
	err = testutil.CollectAndCompare(exporter, strings.NewReader(expected),
		"ceph_pg_last_deep_scrub_stamp", "ceph_scrub_collect_success", "ceph_scrub_overdue_bytes",
		"ceph_scrub_latest_target_seconds", "ceph_scrub_late_pgs", "ceph_scrub_late_bytes", "ceph_scrub_late_max_seconds",
		"ceph_scrub_breach_pgs", "ceph_scrub_target_interval_seconds", "ceph_scrub_warn_interval_seconds")
	if err != nil {
		t.Error(err)
	}
}

func TestExporterOmitsDisabledHealthCheck(t *testing.T) {
	iv := testIntervals
	iv.Health.Ratio = map[Depth]float64{Shallow: 0, Deep: 0.75}
	raw := []byte(`{"pg_stats": [
		{"pgid": "7.a", "last_scrub_stamp": "2026-01-01T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-01-01T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}}
	]}`)
	snap, err := Compute(raw, testNow(t), iv)
	if err != nil {
		t.Fatal(err)
	}
	ps := snap.Pools["7"]
	if _, ok := ps.Deadline[Shallow]; ok {
		t.Error("a zero shallow warn ratio disables the check, but a shallow deadline was recorded")
	}
	if ps.BreachPGs[Shallow] != 0 {
		t.Errorf("BreachPGs[shallow] = %d under a disabled check, want 0", ps.BreachPGs[Shallow])
	}
	exporter := &Exporter{}
	exporter.Store(snap, time.Second)
	expected := `
# HELP ceph_scrub_breach_pgs PGs past the mgr's not-scrubbed warning deadline at this depth; absent while that check is disabled
# TYPE ceph_scrub_breach_pgs gauge
ceph_scrub_breach_pgs{depth="deep",pool_id="7"} 1
# HELP ceph_scrub_breach_bytes Bytes in PGs past the mgr's not-scrubbed warning deadline at this depth; absent while that check is disabled
# TYPE ceph_scrub_breach_bytes gauge
ceph_scrub_breach_bytes{depth="deep",pool_id="7"} 100
# HELP ceph_scrub_warn_interval_seconds Age past which the mgr raises PG_NOT_SCRUBBED / PG_NOT_DEEP_SCRUBBED for this pool and depth: interval (pool scrub_max_interval / deep_scrub_interval if > 0, else the mgr's osd_scrub_max_interval / osd_deep_scrub_interval) x (1 + the mgr's mon_warn_pg_not_*scrubbed_ratio); absent while that ratio is 0, which disables the check
# TYPE ceph_scrub_warn_interval_seconds gauge
ceph_scrub_warn_interval_seconds{depth="deep",pool_id="7"} 4.2336e+06
`
	err = testutil.CollectAndCompare(exporter, strings.NewReader(expected),
		"ceph_scrub_breach_pgs", "ceph_scrub_breach_bytes", "ceph_scrub_warn_interval_seconds")
	if err != nil {
		t.Error(err)
	}
}

func TestFetchToleratesWaitDelayWithOutput(t *testing.T) {
	pipeHolder := []string{"sh", "-c", `echo '{"pg_stats":[]}'; sleep 3 & exit 0`}
	out, err := Fetch(context.Background(), pipeHolder)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if got := strings.TrimSpace(string(out)); got != `{"pg_stats":[]}` {
		t.Errorf("output: %q", got)
	}
}

func TestFetchIntervalsFailsOnWaitDelay(t *testing.T) {
	pipeHolder := []string{"sh", "-c", `echo 604800.0; sleep 3 & exit 0`}
	_, err := FetchIntervals(context.Background(), pipeHolder)
	if !errors.Is(err, exec.ErrWaitDelay) {
		t.Errorf("want ErrWaitDelay, got %v", err)
	}
}

// The mgr answers differ from the osd ones so a value read from the wrong
// section cannot pass.
func TestFetchIntervalsReadsEachViewFromItsSection(t *testing.T) {
	dir := t.TempDir()
	fakeCeph := filepath.Join(dir, "ceph")
	script := `echo "$*" >> "$(dirname "$0")/calls"
case "$*" in
"config get osd osd_scrub_max_interval") echo 604800.000000 ;;
"config get osd osd_deep_scrub_interval") echo 2419200.000000 ;;
"config get osd osd_scrub_min_interval") echo 86400.000000 ;;
"config get osd osd_scrub_interval_randomize_ratio") echo 0.500000 ;;
"config get osd osd_deep_scrub_interval_cv") echo 0.200000 ;;
"config get mgr osd_scrub_max_interval") echo 1209600.000000 ;;
"config get mgr osd_deep_scrub_interval") echo 3628800.000000 ;;
"config get mgr mon_warn_pg_not_scrubbed_ratio") echo 0.000000 ;;
"config get mgr mon_warn_pg_not_deep_scrubbed_ratio") echo 0.750000 ;;
"osd pool ls detail -f json") echo '[{"pool_id": 7, "options": {"scrub_min_interval": 43200, "scrub_max_interval": 86400, "deep_scrub_interval": 1209600}}]' ;;
*) echo "unexpected: $*" >&2; exit 1 ;;
esac
`
	if err := os.WriteFile(fakeCeph, []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}
	iv, err := FetchIntervals(context.Background(), []string{"sh", fakeCeph})
	if err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(filepath.Join(dir, "calls"))
	if err != nil {
		t.Fatal(err)
	}
	calls := strings.Split(strings.TrimSpace(string(raw)), "\n")
	slices.Sort(calls)
	wantCalls := []string{
		"config get mgr mon_warn_pg_not_deep_scrubbed_ratio",
		"config get mgr mon_warn_pg_not_scrubbed_ratio",
		"config get mgr osd_deep_scrub_interval",
		"config get mgr osd_scrub_max_interval",
		"config get osd osd_deep_scrub_interval",
		"config get osd osd_deep_scrub_interval_cv",
		"config get osd osd_scrub_interval_randomize_ratio",
		"config get osd osd_scrub_max_interval",
		"config get osd osd_scrub_min_interval",
		"osd pool ls detail -f json",
	}
	if !slices.Equal(calls, wantCalls) {
		t.Errorf("ceph calls:\n got %q\nwant %q", calls, wantCalls)
	}

	want := Intervals{
		Global:  map[Depth]time.Duration{Shallow: 7 * day, Deep: 28 * day},
		PerPool: map[string]map[Depth]time.Duration{"7": {Shallow: day, Deep: 14 * day}},
		Scheduler: Policy{
			Interval: map[Depth]time.Duration{Shallow: day, Deep: 28 * day},
			PerPool:  map[string]map[Depth]time.Duration{"7": {Shallow: 12 * time.Hour, Deep: 14 * day}},
			Ratio:    map[Depth]float64{Shallow: 0.5, Deep: 0.2},
		},
		Health: Policy{
			Interval: map[Depth]time.Duration{Shallow: 14 * day, Deep: 42 * day},
			PerPool:  map[string]map[Depth]time.Duration{"7": {Shallow: day, Deep: 14 * day}},
			Ratio:    map[Depth]float64{Shallow: 0, Deep: 0.75},
		},
	}
	if !reflect.DeepEqual(iv, want) {
		t.Errorf("intervals:\n got %+v\nwant %+v", iv, want)
	}

	// What main's applyPins does to a pinned depth.
	delete(iv.PerPool["7"], Deep)
	if got := iv.Health.PerPool["7"][Deep]; got != 14*day {
		t.Errorf("pinning PerPool leaked into the health view: got %v, want 336h", got)
	}
	if got := iv.Scheduler.PerPool["7"][Deep]; got != 14*day {
		t.Errorf("pinning PerPool leaked into the scheduler view: got %v, want 336h", got)
	}
}

func TestParseIntervalSeconds(t *testing.T) {
	d, err := parseIntervalSeconds("2419200.000000\n")
	if err != nil || d != 28*24*time.Hour {
		t.Errorf("deep: got %v %v, want 672h", d, err)
	}
	d, err = parseIntervalSeconds("604800.000000\n")
	if err != nil || d != 7*24*time.Hour {
		t.Errorf("shallow: got %v %v, want 168h", d, err)
	}
	d, err = parseIntervalSeconds("0.000000\n")
	if err != nil || d != 0 {
		t.Errorf("zero: got %v %v, want 0s: ceph uses a zero interval as is", d, err)
	}
	for _, bad := range []string{"", "abc", "-1"} {
		if _, err := parseIntervalSeconds(bad); err == nil {
			t.Errorf("parseIntervalSeconds(%q) should error", bad)
		}
	}
}

func TestSetPoolOverrides(t *testing.T) {
	raw := []byte(`[
		{"pool_id": 2, "pool_name": "data", "options": {}},
		{"pool_id": 7, "pool_name": "ctl", "options": {"deep_scrub_interval": 1209600.0}},
		{"pool_id": 8, "pool_name": "meta", "options": {"scrub_min_interval": 3600.0, "scrub_max_interval": 86400.0, "deep_scrub_interval": 0}}
	]`)
	var iv Intervals
	if err := iv.setPoolOverrides(raw); err != nil {
		t.Fatal(err)
	}
	wantMax := map[string]map[Depth]time.Duration{"7": {Deep: 14 * day}, "8": {Shallow: day}}
	if !reflect.DeepEqual(iv.PerPool, wantMax) {
		t.Errorf("PerPool: got %v, want %v", iv.PerPool, wantMax)
	}
	if !reflect.DeepEqual(iv.Health.PerPool, wantMax) {
		t.Errorf("Health.PerPool: got %v, want %v", iv.Health.PerPool, wantMax)
	}
	wantMin := map[string]map[Depth]time.Duration{"7": {Deep: 14 * day}, "8": {Shallow: time.Hour}}
	if !reflect.DeepEqual(iv.Scheduler.PerPool, wantMin) {
		t.Errorf("Scheduler.PerPool: got %v, want %v", iv.Scheduler.PerPool, wantMin)
	}
}

func TestComputeAppliesPoolOverride(t *testing.T) {
	now := testNow(t)
	iv := Intervals{
		Global:  map[Depth]time.Duration{Shallow: 7 * 24 * time.Hour, Deep: 28 * 24 * time.Hour},
		PerPool: map[string]map[Depth]time.Duration{"7": {Deep: 24 * time.Hour}},
	}
	raw := []byte(`{"pg_stats": [
		{"pgid": "7.a", "last_scrub_stamp": "2026-08-29T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-29T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "2.a", "last_scrub_stamp": "2026-08-29T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-29T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}}
	]}`)
	snap, err := Compute(raw, now, iv)
	if err != nil {
		t.Fatal(err)
	}
	if got := snap.Pools["7"].OverduePGs[Deep]; got != 1 {
		t.Errorf("pool 7 deep overdue under 24h override: got %d, want 1 (stamp is 3d old)", got)
	}
	if got := snap.Pools["2"].OverduePGs[Deep]; got != 0 {
		t.Errorf("pool 2 deep overdue under 28d global: got %d, want 0", got)
	}
	if got := snap.Pools["7"].Interval[Deep]; got != 24*time.Hour {
		t.Errorf("pool 7 recorded interval: got %v, want 24h", got)
	}
}

func TestLatestTarget(t *testing.T) {
	spice := Intervals{
		Global: map[Depth]time.Duration{Shallow: 7 * day, Deep: 28 * day},
		Scheduler: Policy{
			Interval: map[Depth]time.Duration{Shallow: day, Deep: 28 * day},
			PerPool:  map[string]map[Depth]time.Duration{"9": {Shallow: 12 * time.Hour, Deep: 14 * day}},
			Ratio:    map[Depth]float64{Shallow: 0.5, Deep: 0.2},
		},
	}
	pinned := spice
	pinned.Global = map[Depth]time.Duration{Shallow: 3 * day, Deep: 5 * day}
	pinned.PerPool = map[string]map[Depth]time.Duration{"2": {Shallow: time.Hour, Deep: time.Hour}}
	noSpread := spice
	noSpread.Scheduler.Ratio = map[Depth]float64{Shallow: 0, Deep: 0}
	zeroMin := spice
	zeroMin.Scheduler.Interval = map[Depth]time.Duration{Shallow: 0, Deep: 28 * day}
	unread := Intervals{Global: map[Depth]time.Duration{Shallow: 3 * day, Deep: 28 * day}}

	cases := []struct {
		name  string
		iv    Intervals
		pool  string
		depth Depth
		want  time.Duration
	}{
		{"deep 28d cv 0.2", spice, "2", Deep, 940*time.Hour + 48*time.Minute},
		{"shallow 1d ratio 0.5", spice, "2", Shallow, 36 * time.Hour},
		{"deep pool override", spice, "9", Deep, 470*time.Hour + 24*time.Minute},
		{"shallow pool override", spice, "9", Shallow, 18 * time.Hour},
		{"pins do not move deep", pinned, "2", Deep, 940*time.Hour + 48*time.Minute},
		{"pins do not move shallow", pinned, "2", Shallow, 36 * time.Hour},
		{"cv 0 is exactly the interval", noSpread, "2", Deep, 28 * day},
		{"ratio 0 is exactly the min interval", noSpread, "2", Shallow, day},
		{"a zero min interval is read, not unset", zeroMin, "2", Shallow, 0},
		{"unread deep falls back to ceph's 7d and cv 0.2, not the target interval", unread, "2", Deep, 235*time.Hour + 12*time.Minute},
		{"unread shallow falls back to ceph's 1d and ratio 0.5", unread, "2", Shallow, 36 * time.Hour},
	}
	for _, c := range cases {
		if got := c.iv.LatestTarget(c.pool, c.depth); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestComputeCountsLatePastLatestTarget(t *testing.T) {
	// Deep 40d is 0.8d past the 39.2d latest target, 38d is inside it, and an
	// unparsable stamp has no age to be late with. Shallow 2d is 12h past 1.5d.
	raw := []byte(`{"pg_stats": [
		{"pgid": "2.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-23T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "2.b", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-25T00:00:00.000000+0000", "stat_sum": {"num_bytes": 200}},
		{"pgid": "2.c", "last_scrub_stamp": "2026-08-30T00:00:00.000000+0000", "last_deep_scrub_stamp": "", "stat_sum": {"num_bytes": 400}}
	]}`)
	snap, err := Compute(raw, testNow(t), testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	ps := snap.Pools["2"]
	if got := ps.OverduePGs[Deep]; got != 3 {
		t.Errorf("OverduePGs[deep] = %d, want 3 (both stamps past 28d, plus the unparsable one)", got)
	}
	if got := ps.LatePGs[Deep]; got != 1 {
		t.Errorf("LatePGs[deep] = %d, want 1", got)
	}
	if got := ps.LateBytes[Deep]; got != 100 {
		t.Errorf("LateBytes[deep] = %d, want 100", got)
	}
	if got := ps.MaxLate[Deep]; got != 19*time.Hour+12*time.Minute {
		t.Errorf("MaxLate[deep] = %v, want 19h12m", got)
	}
	if got := ps.LatePGs[Shallow]; got != 1 {
		t.Errorf("LatePGs[shallow] = %d, want 1", got)
	}
	if got := ps.LateBytes[Shallow]; got != 400 {
		t.Errorf("LateBytes[shallow] = %d, want 400", got)
	}
	if got := ps.MaxLate[Shallow]; got != 12*time.Hour {
		t.Errorf("MaxLate[shallow] = %v, want 12h", got)
	}
}

func TestComputeBreachFollowsMgrViewNotPins(t *testing.T) {
	// A 7d deep pin moves the overdue target only; the mgr still warns at
	// 28d x 1.75 = 49d, so of 48d and 50d only the second breaches.
	iv := Intervals{
		Global: map[Depth]time.Duration{Shallow: 7 * day, Deep: 7 * day},
		Health: Policy{
			Interval: map[Depth]time.Duration{Shallow: 7 * day, Deep: 28 * day},
			Ratio:    map[Depth]float64{Shallow: 0.5, Deep: 0.75},
		},
	}
	raw := []byte(`{"pg_stats": [
		{"pgid": "2.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-15T00:00:00.000000+0000", "scrub_schedule": "queued for deep scrub", "stat_sum": {"num_bytes": 100}},
		{"pgid": "2.b", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-13T00:00:00.000000+0000", "scrub_schedule": "queued for deep scrub", "stat_sum": {"num_bytes": 200}}
	]}`)
	snap, err := Compute(raw, testNow(t), iv)
	if err != nil {
		t.Fatal(err)
	}
	ps := snap.Pools["2"]
	if got := ps.OverduePGs[Deep]; got != 2 {
		t.Errorf("OverduePGs = %d under the 7d pin, want 2", got)
	}
	if got := ps.Deadline[Deep]; got != 49*day {
		t.Errorf("Deadline = %s, want 1176h", got)
	}
	if got := ps.BreachPGs[Deep]; got != 1 {
		t.Errorf("BreachPGs = %d, want 1", got)
	}
	if got := ps.BreachBytes[Deep]; got != 200 {
		t.Errorf("BreachBytes = %d, want 200", got)
	}
}

func TestIntervalsDeadline(t *testing.T) {
	iv := Intervals{
		Global:  map[Depth]time.Duration{Deep: 7 * day},
		PerPool: map[string]map[Depth]time.Duration{"9": {Deep: day}},
		Health: Policy{
			Interval: map[Depth]time.Duration{Deep: 28 * day},
			PerPool:  map[string]map[Depth]time.Duration{"9": {Deep: 7 * day}},
			Ratio:    map[Depth]float64{Deep: 1.0},
		},
	}
	if got, ok := iv.Deadline("2", Deep); !ok || got != 56*day {
		t.Errorf("Deadline = %s %v, want 1344h from the mgr view, not the overdue target", got, ok)
	}
	if got, ok := iv.Deadline("9", Deep); !ok || got != 14*day {
		t.Errorf("the health pool override should carry into the deadline, got %s %v, want 336h", got, ok)
	}
	bare := Intervals{Global: map[Depth]time.Duration{Deep: 28 * day}}
	if got, ok := bare.Deadline("2", Deep); !ok || got != 294*time.Hour {
		t.Errorf("an unread mgr view should fall back to ceph's 7d and default ratio, not the target interval, got %s %v, want 294h", got, ok)
	}
	zero := Intervals{Health: Policy{Interval: map[Depth]time.Duration{Deep: 0}, Ratio: map[Depth]float64{Deep: 0.75}}}
	if got, ok := zero.Deadline("2", Deep); !ok || got != 0 {
		t.Errorf("a zero mgr interval is read, not unset, got %s %v, want 0s", got, ok)
	}
	disabled := Intervals{Global: map[Depth]time.Duration{Deep: 28 * day}, Health: Policy{Ratio: map[Depth]float64{Deep: 0}}}
	if got, ok := disabled.Deadline("2", Deep); ok {
		t.Errorf("a zero warn ratio disables the check, got deadline %s", got)
	}
}

func TestParseRatio(t *testing.T) {
	for in, want := range map[string]float64{"0.75\n": 0.75, "0.500000": 0.5, "0": 0} {
		got, err := parseRatio(in)
		if err != nil || got != want {
			t.Errorf("parseRatio(%q) = %v, %v; want %v", in, got, err, want)
		}
	}
	for _, in := range []string{"-0.1", "", "half"} {
		if _, err := parseRatio(in); err == nil {
			t.Errorf("parseRatio(%q) should error", in)
		}
	}
}
