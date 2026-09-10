package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

var testIntervals = Intervals{Global: map[Depth]time.Duration{
	Shallow: 7 * 24 * time.Hour,
	Deep:    28 * 24 * time.Hour,
}}

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
# HELP ceph_scrub_due_pgs PGs whose next scrub at this depth was scheduled by ceph for a time already past
# TYPE ceph_scrub_due_pgs gauge
ceph_scrub_due_pgs{depth="deep",pool_id="7"} 0
ceph_scrub_due_pgs{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_breach_pgs PGs past the mon's not-scrubbed warning deadline at this depth
# TYPE ceph_scrub_breach_pgs gauge
ceph_scrub_breach_pgs{depth="deep",pool_id="7"} 1
ceph_scrub_breach_pgs{depth="shallow",pool_id="7"} 0
# HELP ceph_scrub_target_interval_seconds Scrub target interval the pool's overdue numbers were judged against
# TYPE ceph_scrub_target_interval_seconds gauge
ceph_scrub_target_interval_seconds{depth="deep",pool_id="7"} 2.4192e+06
ceph_scrub_target_interval_seconds{depth="shallow",pool_id="7"} 604800
# HELP ceph_scrub_warn_interval_seconds Age at which the mon warns about this pool and depth: target interval x (1 + mon_warn_pg_not_scrubbed_ratio)
# TYPE ceph_scrub_warn_interval_seconds gauge
ceph_scrub_warn_interval_seconds{depth="deep",pool_id="7"} 4.2336e+06
ceph_scrub_warn_interval_seconds{depth="shallow",pool_id="7"} 907200
`, float64(deepStamp.UnixMicro())/1e6)
	err = testutil.CollectAndCompare(exporter, strings.NewReader(expected),
		"ceph_pg_last_deep_scrub_stamp", "ceph_scrub_collect_success",
		"ceph_scrub_overdue_bytes", "ceph_scrub_due_pgs", "ceph_scrub_breach_pgs",
		"ceph_scrub_target_interval_seconds", "ceph_scrub_warn_interval_seconds")
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

func TestParseIntervalSeconds(t *testing.T) {
	d, err := parseIntervalSeconds("2419200.000000\n")
	if err != nil || d != 28*24*time.Hour {
		t.Errorf("deep: got %v %v, want 672h", d, err)
	}
	d, err = parseIntervalSeconds("604800.000000\n")
	if err != nil || d != 7*24*time.Hour {
		t.Errorf("shallow: got %v %v, want 168h", d, err)
	}
	for _, bad := range []string{"", "abc", "0.000000", "-1"} {
		if _, err := parseIntervalSeconds(bad); err == nil {
			t.Errorf("parseIntervalSeconds(%q) should error", bad)
		}
	}
}

func TestParsePoolIntervals(t *testing.T) {
	raw := []byte(`[
		{"pool_id": 2, "pool_name": "data", "options": {}},
		{"pool_id": 7, "pool_name": "ctl", "options": {"deep_scrub_interval": 1209600.0}},
		{"pool_id": 8, "pool_name": "meta", "options": {"scrub_max_interval": 86400.0, "deep_scrub_interval": 0}}
	]`)
	perPool, err := parsePoolIntervals(raw)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := perPool["2"]; ok {
		t.Error("pool 2 has no overrides but appeared")
	}
	if got := perPool["7"][Deep]; got != 14*24*time.Hour {
		t.Errorf("pool 7 deep override: got %v, want 336h", got)
	}
	if _, ok := perPool["7"][Shallow]; ok {
		t.Error("pool 7 has no shallow override but one appeared")
	}
	if got := perPool["8"][Shallow]; got != 24*time.Hour {
		t.Errorf("pool 8 shallow override: got %v, want 24h", got)
	}
	if _, ok := perPool["8"][Deep]; ok {
		t.Error("pool 8 deep override is 0 (unset) but appeared")
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

func TestScrubTarget(t *testing.T) {
	cases := map[string]struct {
		depth Depth
		when  string
		ok    bool
	}{
		"periodic scrub scheduled @ 2026-08-29T02:13:18.699625+0000":      {Shallow, "2026-08-29T02:13:18.699625Z", true},
		"periodic deep scrub scheduled @ 2026-09-12T01:00:00.000000+0000": {Deep, "2026-09-12T01:00:00Z", true},
		"queued for deep scrub":                            {ok: false},
		"periodic scrub scheduled @ not-a-timestamp":       {ok: false},
		"periodic deep scrub scheduled @ 2026-09-12T01:00": {ok: false},
	}
	for in, want := range cases {
		depth, when, ok := scrubTarget(in)
		if ok != want.ok {
			t.Errorf("scrubTarget(%q) ok = %v, want %v", in, ok, want.ok)
			continue
		}
		if !ok {
			continue
		}
		if depth != want.depth {
			t.Errorf("scrubTarget(%q) depth = %q, want %q", in, depth, want.depth)
		}
		if got := when.UTC().Format(time.RFC3339Nano); got != want.when {
			t.Errorf("scrubTarget(%q) time = %s, want %s", in, got, want.when)
		}
	}
}

// The regression this metric exists for: ceph randomizes eligibility past the
// target interval and pushes deferred targets, so a PG can sit well past the
// interval while ceph is still on schedule. Age past the interval must not
// read as the scheduler being late.
func TestComputeDueIgnoresPGsCephHasNotScheduledYet(t *testing.T) {
	now := testNow(t)
	raw := []byte(`{"pg_stats": [
		{"pgid": "2.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-31T00:00:00.000000+0000", "scrub_schedule": "periodic deep scrub scheduled @ 2026-09-02T00:00:00.000000+0000", "stat_sum": {"num_bytes": 100}},
		{"pgid": "2.b", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-31T00:00:00.000000+0000", "scrub_schedule": "periodic deep scrub scheduled @ 2026-08-31T00:00:00.000000+0000", "stat_sum": {"num_bytes": 200}}
	]}`)
	snap, err := Compute(raw, now, testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	ps := snap.Pools["2"]
	if got := ps.OverduePGs[Deep]; got != 2 {
		t.Errorf("both PGs are past the 28d interval, OverduePGs = %d, want 2", got)
	}
	if got := ps.DuePGs[Deep]; got != 1 {
		t.Errorf("only 2.b is past its ceph-scheduled time, DuePGs = %d, want 1", got)
	}
	if got := ps.DueBytes[Deep]; got != 200 {
		t.Errorf("DueBytes = %d, want 200", got)
	}
	if got := ps.MaxLate[Deep]; got != 24*time.Hour {
		t.Errorf("MaxLate = %s, want 24h", got)
	}
	if got := ps.BreachPGs[Deep]; got != 0 {
		t.Errorf("32d is inside the 49d warn deadline, BreachPGs = %d, want 0", got)
	}
}

func TestComputeBreachTracksWarnDeadline(t *testing.T) {
	now := testNow(t)
	// 48d and 50d past a 28d interval: the mon warns at 28d x 1.75 = 49d.
	raw := []byte(`{"pg_stats": [
		{"pgid": "2.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-15T00:00:00.000000+0000", "scrub_schedule": "queued for deep scrub", "stat_sum": {"num_bytes": 100}},
		{"pgid": "2.b", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-07-13T00:00:00.000000+0000", "scrub_schedule": "queued for deep scrub", "stat_sum": {"num_bytes": 200}}
	]}`)
	snap, err := Compute(raw, now, testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	ps := snap.Pools["2"]
	if got := ps.Deadline[Deep]; got != 49*24*time.Hour {
		t.Errorf("Deadline = %s, want 1176h", got)
	}
	if got := ps.BreachPGs[Deep]; got != 1 {
		t.Errorf("BreachPGs = %d, want 1", got)
	}
	if got := ps.BreachBytes[Deep]; got != 200 {
		t.Errorf("BreachBytes = %d, want 200", got)
	}
}

func TestComputeCountsUnreadableScheduleSeparately(t *testing.T) {
	raw := []byte(`{"pg_stats": [
		{"pgid": "2.a", "last_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "last_deep_scrub_stamp": "2026-08-31T00:00:00.000000+0000", "scrub_schedule": "periodic scrub scheduled @ tomorrow-ish", "stat_sum": {"num_bytes": 100}}
	]}`)
	snap, err := Compute(raw, testNow(t), testIntervals)
	if err != nil {
		t.Fatal(err)
	}
	if snap.ScheduleParseErrors != 1 {
		t.Errorf("ScheduleParseErrors = %d, want 1", snap.ScheduleParseErrors)
	}
	if snap.ParseErrors != 0 {
		t.Errorf("a bad schedule must not spend the stamp-parse budget, ParseErrors = %d", snap.ParseErrors)
	}
	if got := snap.Pools["2"].DuePGs[Shallow]; got != 0 {
		t.Errorf("an unreadable target must not read as late, DuePGs = %d", got)
	}
}

func TestIntervalsDeadline(t *testing.T) {
	iv := Intervals{
		Global:    map[Depth]time.Duration{Deep: 28 * 24 * time.Hour},
		PerPool:   map[string]map[Depth]time.Duration{"9": {Deep: 7 * 24 * time.Hour}},
		WarnRatio: map[Depth]float64{Deep: 1.0},
	}
	if got := iv.Deadline("2", Deep); got != 56*24*time.Hour {
		t.Errorf("Deadline = %s, want 1344h", got)
	}
	if got := iv.Deadline("9", Deep); got != 14*24*time.Hour {
		t.Errorf("pool override should carry into the deadline, got %s, want 336h", got)
	}
	bare := Intervals{Global: map[Depth]time.Duration{Deep: 28 * 24 * time.Hour}}
	if got := bare.Deadline("2", Deep); got != 49*24*time.Hour {
		t.Errorf("missing ratio should fall back to ceph's default, got %s, want 1176h", got)
	}
}

func TestParseWarnRatio(t *testing.T) {
	for in, want := range map[string]float64{"0.75\n": 0.75, "0.500000": 0.5, "0": 0} {
		got, err := parseWarnRatio(in)
		if err != nil || got != want {
			t.Errorf("parseWarnRatio(%q) = %v, %v; want %v", in, got, err, want)
		}
	}
	for _, in := range []string{"-0.1", "", "half"} {
		if _, err := parseWarnRatio(in); err == nil {
			t.Errorf("parseWarnRatio(%q) should error", in)
		}
	}
}
