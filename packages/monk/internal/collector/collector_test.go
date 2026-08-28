package collector

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

var testIntervals = map[Depth]time.Duration{
	Shallow: 7 * 24 * time.Hour,
	Deep:    28 * 24 * time.Hour,
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
			if now.Sub(stamp) > testIntervals[depth] {
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
