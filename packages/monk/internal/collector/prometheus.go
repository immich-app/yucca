package collector

import (
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var (
	// Names track ceph PR #68925 so a future upstream implementation supersedes these.
	descLastScrub     = prometheus.NewDesc("ceph_pg_last_scrub_stamp", "Oldest per-PG last_scrub_stamp in the pool (seconds since epoch)", []string{"pool_id"}, nil)
	descLastDeepScrub = prometheus.NewDesc("ceph_pg_last_deep_scrub_stamp", "Oldest per-PG last_deep_scrub_stamp in the pool (seconds since epoch)", []string{"pool_id"}, nil)

	descPoolPGs     = prometheus.NewDesc("ceph_scrub_pool_pgs", "PGs in the pool", []string{"pool_id"}, nil)
	descPoolOmap    = prometheus.NewDesc("ceph_scrub_pool_omap_bytes", "Omap bytes in the pool (excluded from ceph_scrub_pool_bytes)", []string{"pool_id"}, nil)
	descOverdueOmap = prometheus.NewDesc("ceph_scrub_overdue_omap_bytes", "Omap bytes in PGs whose last scrub at this depth is older than the target interval", []string{"pool_id", "depth"}, nil)
	descCompletions = prometheus.NewDesc("ceph_scrub_completions_total", "PGs observed completing a scrub at this depth since process start", []string{"pool_id", "depth"}, nil)
	descCompletedB  = prometheus.NewDesc("ceph_scrub_completed_bytes_total", "Stored bytes in PGs observed completing a scrub at this depth since process start", []string{"pool_id", "depth"}, nil)
	descPoolBytes   = prometheus.NewDesc("ceph_scrub_pool_bytes", "Stored bytes in the pool (sum of PG stat_sum.num_bytes)", []string{"pool_id"}, nil)
	// overdue has a nonzero floor on a healthy cluster and must not drive a
	// verdict. See PoolStats.
	descOverduePGs   = prometheus.NewDesc("ceph_scrub_overdue_pgs", "PGs whose last scrub at this depth is older than the target interval", []string{"pool_id", "depth"}, nil)
	descOverdueBytes = prometheus.NewDesc("ceph_scrub_overdue_bytes", "Bytes in PGs whose last scrub at this depth is older than the target interval", []string{"pool_id", "depth"}, nil)
	descLatestTarget = prometheus.NewDesc("ceph_scrub_latest_target_seconds", "Top of ceph's randomized scheduling window (scheduled_at) for a PG in this pool at this depth; a PG older than this was delayed past every target ceph could have drawn", []string{"pool_id", "depth"}, nil)
	descLatePGs      = prometheus.NewDesc("ceph_scrub_late_pgs", "PGs whose last scrub at this depth is older than ceph's latest scheduling target", []string{"pool_id", "depth"}, nil)
	descLateBytes    = prometheus.NewDesc("ceph_scrub_late_bytes", "Bytes in PGs whose last scrub at this depth is older than ceph's latest scheduling target", []string{"pool_id", "depth"}, nil)
	descLateMax      = prometheus.NewDesc("ceph_scrub_late_max_seconds", "How far past ceph's latest scheduling target the oldest PG at this depth is, 0 if none", []string{"pool_id", "depth"}, nil)
	descBreachPGs    = prometheus.NewDesc("ceph_scrub_breach_pgs", "PGs past the mgr's not-scrubbed warning deadline at this depth; absent while that check is disabled", []string{"pool_id", "depth"}, nil)
	descBreachBytes  = prometheus.NewDesc("ceph_scrub_breach_bytes", "Bytes in PGs past the mgr's not-scrubbed warning deadline at this depth; absent while that check is disabled", []string{"pool_id", "depth"}, nil)
	descDeadline     = prometheus.NewDesc("ceph_scrub_warn_interval_seconds", "Age past which the mgr raises PG_NOT_SCRUBBED / PG_NOT_DEEP_SCRUBBED for this pool and depth: interval (pool scrub_max_interval / deep_scrub_interval if > 0, else the mgr's osd_scrub_max_interval / osd_deep_scrub_interval) x (1 + the mgr's mon_warn_pg_not_*scrubbed_ratio); absent while that ratio is 0, which disables the check", []string{"pool_id", "depth"}, nil)
	descAgeHist      = prometheus.NewDesc("ceph_scrub_age_seconds", "Scrub age distribution weighted by bytes: each stored byte observes its PG's age", []string{"pool_id", "depth"}, nil)
	descSchedule     = prometheus.NewDesc("ceph_scrub_schedule_pgs", "PGs by scrub_schedule state", []string{"state"}, nil)
	descInterval     = prometheus.NewDesc("ceph_scrub_target_interval_seconds", "Scrub target interval the pool's overdue numbers were judged against", []string{"pool_id", "depth"}, nil)

	descSuccess      = prometheus.NewDesc("ceph_scrub_collect_success", "Whether the last pg ls collection succeeded", nil, nil)
	descFailures     = prometheus.NewDesc("ceph_scrub_collect_failures_total", "Failed collections since process start", nil, nil)
	descDuration     = prometheus.NewDesc("ceph_scrub_collect_duration_seconds", "Duration of the last successful collection", nil, nil)
	descTimestamp    = prometheus.NewDesc("ceph_scrub_collect_timestamp_seconds", "Time of the last successful collection", nil, nil)
	descParseErrors  = prometheus.NewDesc("ceph_scrub_parse_errors", "Unparsable pgids and stamp fields in the last successful collection (PGs with unparsable stamps count as overdue, never late or breach)", nil, nil)
	descIntervalOK   = prometheus.NewDesc("ceph_scrub_interval_read_success", "Whether the last read of the cluster's scrub config (osd and mgr config sections, pool options) succeeded", nil, nil)
	descIntervalTime = prometheus.NewDesc("ceph_scrub_interval_read_timestamp_seconds", "Time of the last successful scrub config read", nil, nil)
)

// After this many consecutive failures the stale snapshot is dropped, so the
// instance's pool series go absent and query-side dedup stops preferring them.
const expireAfterFailures = 5

type exporterState struct {
	// Completion counters are accumulated by diffing consecutive snapshots.
	// The maps are copied on write: Collect reads them through the atomic
	// pointer while the collection loop is building the next state.
	completions      map[string]map[Depth]uint64
	completedBytes   map[string]map[Depth]uint64
	snapshot         *Snapshot
	duration         time.Duration
	failed           bool
	failures         uint64
	consecutiveFails int
	intervalReadOK   bool
	intervalReadTime time.Time
}

// Exporter's state is written only by the collection loop; Collect runs
// concurrently and reads through the atomic pointer.
type Exporter struct {
	state atomic.Pointer[exporterState]
}

func (e *Exporter) load() exporterState {
	if s := e.state.Load(); s != nil {
		return *s
	}
	return exporterState{failed: true}
}

func (e *Exporter) Store(snap *Snapshot, took time.Duration) {
	s := e.load()
	s.completions, s.completedBytes = accumulate(s.completions, s.completedBytes, s.snapshot, snap)
	s.snapshot, s.duration, s.failed, s.consecutiveFails = snap, took, false, 0
	e.state.Store(&s)
}

// accumulate counts the PGs whose stamp advanced between two snapshots. A PG
// absent from either side is skipped rather than counted: pool deletion and PG
// splits would otherwise register as scrub completions. A refresh with no
// predecessor counts nothing: that is the first snapshot after start, and also
// the first one after an outage long enough to expire the stored snapshot, so
// scrubs completed during an outage are unobservable rather than backfilled.
func accumulate(prevN map[string]map[Depth]uint64, prevB map[string]map[Depth]uint64, old, cur *Snapshot) (map[string]map[Depth]uint64, map[string]map[Depth]uint64) {
	n := map[string]map[Depth]uint64{}
	b := map[string]map[Depth]uint64{}
	for pool, byDepth := range prevN {
		n[pool] = map[Depth]uint64{}
		for d, v := range byDepth {
			n[pool][d] = v
		}
	}
	for pool, byDepth := range prevB {
		b[pool] = map[Depth]uint64{}
		for d, v := range byDepth {
			b[pool][d] = v
		}
	}
	if old == nil || cur == nil {
		return n, b
	}
	for pgid, now := range cur.PGState {
		was, ok := old.PGState[pgid]
		if !ok {
			continue
		}
		for _, depth := range Depths {
			newStamp, okNew := now.StampAt(depth)
			oldStamp, okOld := was.StampAt(depth)
			if !okNew || !okOld || !newStamp.After(oldStamp) {
				continue
			}
			if n[now.Pool] == nil {
				n[now.Pool] = map[Depth]uint64{}
			}
			if b[now.Pool] == nil {
				b[now.Pool] = map[Depth]uint64{}
			}
			n[now.Pool][depth]++
			b[now.Pool][depth] += uint64(max(now.Bytes, 0))
		}
	}
	return n, b
}

func (e *Exporter) MarkFailed() {
	s := e.load()
	s.failed = true
	s.failures++
	s.consecutiveFails++
	if s.consecutiveFails >= expireAfterFailures {
		s.snapshot = nil
	}
	e.state.Store(&s)
}

func (e *Exporter) StoreIntervalRead(ok bool, when time.Time) {
	s := e.load()
	s.intervalReadOK = ok
	if ok {
		s.intervalReadTime = when
	}
	e.state.Store(&s)
}

func (e *Exporter) Describe(ch chan<- *prometheus.Desc) {
	prometheus.DescribeByCollect(e, ch)
}

func (e *Exporter) Collect(ch chan<- prometheus.Metric) {
	s := e.load()
	success := 1.0
	if s.failed {
		success = 0.0
	}
	ch <- prometheus.MustNewConstMetric(descSuccess, prometheus.GaugeValue, success)
	ch <- prometheus.MustNewConstMetric(descFailures, prometheus.CounterValue, float64(s.failures))
	intervalOK := 0.0
	if s.intervalReadOK {
		intervalOK = 1.0
	}
	ch <- prometheus.MustNewConstMetric(descIntervalOK, prometheus.GaugeValue, intervalOK)
	if !s.intervalReadTime.IsZero() {
		ch <- prometheus.MustNewConstMetric(descIntervalTime, prometheus.GaugeValue, float64(s.intervalReadTime.Unix()))
	}

	for pool, byDepth := range s.completions {
		for depth, v := range byDepth {
			ch <- prometheus.MustNewConstMetric(descCompletions, prometheus.CounterValue, float64(v), pool, string(depth))
		}
	}
	for pool, byDepth := range s.completedBytes {
		for depth, v := range byDepth {
			ch <- prometheus.MustNewConstMetric(descCompletedB, prometheus.CounterValue, float64(v), pool, string(depth))
		}
	}

	// Counters above survive snapshot expiry: they are process-lifetime state,
	// and letting them go absent would read downstream as a counter reset.
	snap := s.snapshot
	if snap == nil {
		return
	}
	ch <- prometheus.MustNewConstMetric(descDuration, prometheus.GaugeValue, s.duration.Seconds())
	ch <- prometheus.MustNewConstMetric(descTimestamp, prometheus.GaugeValue, float64(snap.Taken.Unix()))
	ch <- prometheus.MustNewConstMetric(descParseErrors, prometheus.GaugeValue, float64(snap.ParseErrors))

	for state, n := range snap.ScheduleStates {
		ch <- prometheus.MustNewConstMetric(descSchedule, prometheus.GaugeValue, float64(n), state)
	}
	// Late and breach are claims about ceph's own config. Before this instance
	// has read it they would be judged against built-in defaults, and the
	// max-dedup across instances would publish the worst of them.
	configRead := !s.intervalReadTime.IsZero()
	for pool, ps := range snap.Pools {
		ch <- prometheus.MustNewConstMetric(descPoolPGs, prometheus.GaugeValue, float64(ps.PGs), pool)
		ch <- prometheus.MustNewConstMetric(descPoolBytes, prometheus.GaugeValue, float64(ps.Bytes), pool)
		ch <- prometheus.MustNewConstMetric(descPoolOmap, prometheus.GaugeValue, float64(ps.OmapBytes), pool)
		if s, ok := ps.OldestStamp[Shallow]; ok {
			ch <- prometheus.MustNewConstMetric(descLastScrub, prometheus.GaugeValue, float64(s.UnixMicro())/1e6, pool)
		}
		if s, ok := ps.OldestStamp[Deep]; ok {
			ch <- prometheus.MustNewConstMetric(descLastDeepScrub, prometheus.GaugeValue, float64(s.UnixMicro())/1e6, pool)
		}
		for _, depth := range Depths {
			ch <- prometheus.MustNewConstMetric(descInterval, prometheus.GaugeValue, ps.Interval[depth].Seconds(), pool, string(depth))
			ch <- prometheus.MustNewConstMetric(descOverduePGs, prometheus.GaugeValue, float64(ps.OverduePGs[depth]), pool, string(depth))
			ch <- prometheus.MustNewConstMetric(descOverdueBytes, prometheus.GaugeValue, float64(ps.OverdueBytes[depth]), pool, string(depth))
			ch <- prometheus.MustNewConstMetric(descOverdueOmap, prometheus.GaugeValue, float64(ps.OverdueOmapBytes[depth]), pool, string(depth))
			if configRead {
				ch <- prometheus.MustNewConstMetric(descLatestTarget, prometheus.GaugeValue, ps.LatestTarget[depth].Seconds(), pool, string(depth))
				ch <- prometheus.MustNewConstMetric(descLatePGs, prometheus.GaugeValue, float64(ps.LatePGs[depth]), pool, string(depth))
				ch <- prometheus.MustNewConstMetric(descLateBytes, prometheus.GaugeValue, float64(ps.LateBytes[depth]), pool, string(depth))
				ch <- prometheus.MustNewConstMetric(descLateMax, prometheus.GaugeValue, ps.MaxLate[depth].Seconds(), pool, string(depth))
				if deadline, ok := ps.Deadline[depth]; ok {
					ch <- prometheus.MustNewConstMetric(descDeadline, prometheus.GaugeValue, deadline.Seconds(), pool, string(depth))
					ch <- prometheus.MustNewConstMetric(descBreachPGs, prometheus.GaugeValue, float64(ps.BreachPGs[depth]), pool, string(depth))
					ch <- prometheus.MustNewConstMetric(descBreachBytes, prometheus.GaugeValue, float64(ps.BreachBytes[depth]), pool, string(depth))
				}
			}
			buckets := make(map[float64]uint64, len(AgeBuckets))
			for i, le := range AgeBuckets {
				buckets[le.Seconds()] = uint64(ps.AgeBucketBytes[depth][i])
			}
			ch <- prometheus.MustNewConstHistogram(descAgeHist, uint64(ps.ParsedBytes[depth]), ps.AgeSum[depth], buckets, pool, string(depth))
		}
	}
}
