package collector

import (
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func pgls(pgid, deepStamp string, bytes, omap int64) string {
	return `{"pgid":"` + pgid + `","state":"active+clean","last_scrub_stamp":"2026-09-01T00:00:00.000000+0000",` +
		`"last_deep_scrub_stamp":"` + deepStamp + `","scrub_schedule":"scheduled @ 2026-09-02T00:00:00",` +
		`"stat_sum":{"num_bytes":` + itoa(bytes) + `,"num_omap_bytes":` + itoa(omap) + `}}`
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	var b []byte
	for v > 0 {
		b = append([]byte{byte('0' + v%10)}, b...)
		v /= 10
	}
	return string(b)
}

func snapshot(t *testing.T, pgs []string, now time.Time) *Snapshot {
	t.Helper()
	raw := `{"pg_stats":[` + strings.Join(pgs, ",") + `]}`
	iv := Intervals{Global: map[Depth]time.Duration{Shallow: 7 * 24 * time.Hour, Deep: 28 * 24 * time.Hour}}
	s, err := Compute([]byte(raw), now, iv)
	if err != nil {
		t.Fatalf("Compute: %v", err)
	}
	return s
}

func TestCompletionsCountOnlyAdvancedStamps(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	old := snapshot(t, []string{
		pgls("2.a", "2026-08-01T00:00:00.000000+0000", 100, 0),
		pgls("2.b", "2026-08-01T00:00:00.000000+0000", 200, 0),
	}, now)
	// 2.a scrubbed, 2.b did not, 2.c is new so its history is unknown.
	next := snapshot(t, []string{
		pgls("2.a", "2026-09-01T00:00:00.000000+0000", 100, 0),
		pgls("2.b", "2026-08-01T00:00:00.000000+0000", 200, 0),
		pgls("2.c", "2026-09-01T00:00:00.000000+0000", 400, 0),
	}, now)

	e := &Exporter{}
	e.Store(old, time.Second)
	e.Store(next, time.Second)

	want := `
# HELP ceph_scrub_completions_total PGs observed completing a scrub at this depth since process start
# TYPE ceph_scrub_completions_total counter
ceph_scrub_completions_total{depth="deep",pool_id="2"} 1
`
	if err := testutil.CollectAndCompare(e, strings.NewReader(want), "ceph_scrub_completions_total"); err != nil {
		t.Error(err)
	}
	wantBytes := `
# HELP ceph_scrub_completed_bytes_total Stored bytes in PGs observed completing a scrub at this depth since process start
# TYPE ceph_scrub_completed_bytes_total counter
ceph_scrub_completed_bytes_total{depth="deep",pool_id="2"} 100
`
	if err := testutil.CollectAndCompare(e, strings.NewReader(wantBytes), "ceph_scrub_completed_bytes_total"); err != nil {
		t.Error(err)
	}
}

func TestCompletionsAreMonotonicAcrossRefreshes(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	e := &Exporter{}
	e.Store(snapshot(t, []string{pgls("2.a", "2026-08-01T00:00:00.000000+0000", 10, 0)}, now), time.Second)
	e.Store(snapshot(t, []string{pgls("2.a", "2026-08-15T00:00:00.000000+0000", 10, 0)}, now), time.Second)
	e.Store(snapshot(t, []string{pgls("2.a", "2026-08-20T00:00:00.000000+0000", 10, 0)}, now), time.Second)
	// A stamp that does not move must not increment again.
	e.Store(snapshot(t, []string{pgls("2.a", "2026-08-20T00:00:00.000000+0000", 10, 0)}, now), time.Second)

	if got := testutil.ToFloat64(counterOf(t, e, "ceph_scrub_completions_total")); got != 2 {
		t.Errorf("completions = %v, want 2", got)
	}
}

func counterOf(t *testing.T, e *Exporter, name string) prometheus.Collector {
	t.Helper()
	return filtered{e, name}
}

type filtered struct {
	e    *Exporter
	name string
}

func (f filtered) Describe(ch chan<- *prometheus.Desc) { f.e.Describe(ch) }
func (f filtered) Collect(ch chan<- prometheus.Metric) {
	inner := make(chan prometheus.Metric, 512)
	go func() { f.e.Collect(inner); close(inner) }()
	for m := range inner {
		if strings.Contains(m.Desc().String(), f.name) {
			ch <- m
		}
	}
}

func TestOmapBytesTrackedApartFromData(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	// An index-style PG: no data bytes, large omap, far past the deep interval.
	s := snapshot(t, []string{pgls("3.a", "2026-01-01T00:00:00.000000+0000", 0, 164370282557)}, now)
	ps := s.Pools["3"]
	if ps.Bytes != 0 {
		t.Errorf("Bytes = %d, want 0", ps.Bytes)
	}
	if ps.OmapBytes != 164370282557 {
		t.Errorf("OmapBytes = %d, want 164370282557", ps.OmapBytes)
	}
	if ps.OverdueBytes[Deep] != 0 {
		t.Errorf("OverdueBytes = %d, want 0 (byte-weighted coverage cannot see this pool)", ps.OverdueBytes[Deep])
	}
	if ps.OverdueOmapBytes[Deep] != 164370282557 {
		t.Errorf("OverdueOmapBytes = %d, want the full omap", ps.OverdueOmapBytes[Deep])
	}
	if ps.OverduePGs[Deep] != 1 {
		t.Errorf("OverduePGs = %d, want 1", ps.OverduePGs[Deep])
	}
}
