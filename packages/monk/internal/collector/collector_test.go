package collector

import (
	"encoding/json"
	"fmt"
	"os"
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
		{"pgid": "7.b", "last_scrub_stamp": "", "last_deep_scrub_stamp": "", "stat_sum": {"num_bytes": 40}}
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
	if ps.PGs != 2 || ps.Bytes != 140 {
		t.Errorf("pool totals: got %d PGs / %d bytes, want 2 / 140", ps.PGs, ps.Bytes)
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
			if b != 100 {
				t.Errorf("AgeBucketBytes[%s][%d]: got %d, want 100", d, i, b)
			}
		}
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
# HELP ceph_scrub_target_interval_seconds Scrub target interval the pool's overdue numbers were judged against
# TYPE ceph_scrub_target_interval_seconds gauge
ceph_scrub_target_interval_seconds{depth="deep",pool_id="7"} 2.4192e+06
ceph_scrub_target_interval_seconds{depth="shallow",pool_id="7"} 604800
`, float64(deepStamp.UnixMicro())/1e6)
	err = testutil.CollectAndCompare(exporter, strings.NewReader(expected),
		"ceph_pg_last_deep_scrub_stamp", "ceph_scrub_collect_success",
		"ceph_scrub_overdue_bytes", "ceph_scrub_target_interval_seconds")
	if err != nil {
		t.Error(err)
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
