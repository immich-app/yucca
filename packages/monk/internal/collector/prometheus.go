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

	descPoolPGs      = prometheus.NewDesc("ceph_scrub_pool_pgs", "PGs in the pool", []string{"pool_id"}, nil)
	descPoolBytes    = prometheus.NewDesc("ceph_scrub_pool_bytes", "Stored bytes in the pool (sum of PG stat_sum.num_bytes)", []string{"pool_id"}, nil)
	descOverduePGs   = prometheus.NewDesc("ceph_scrub_overdue_pgs", "PGs whose last scrub at this depth is older than the target interval", []string{"pool_id", "depth"}, nil)
	descOverdueBytes = prometheus.NewDesc("ceph_scrub_overdue_bytes", "Bytes in PGs whose last scrub at this depth is older than the target interval", []string{"pool_id", "depth"}, nil)
	descAgeHist      = prometheus.NewDesc("ceph_scrub_age_seconds", "Scrub age distribution weighted by bytes: each stored byte observes its PG's age", []string{"pool_id", "depth"}, nil)
	descSchedule     = prometheus.NewDesc("ceph_scrub_schedule_pgs", "PGs by scrub_schedule state", []string{"state"}, nil)
	descInterval     = prometheus.NewDesc("ceph_scrub_target_interval_seconds", "Scrub target interval the pool's overdue numbers were judged against", []string{"pool_id", "depth"}, nil)

	descSuccess      = prometheus.NewDesc("ceph_scrub_collect_success", "Whether the last pg ls collection succeeded", nil, nil)
	descFailures     = prometheus.NewDesc("ceph_scrub_collect_failures_total", "Failed collections since process start", nil, nil)
	descDuration     = prometheus.NewDesc("ceph_scrub_collect_duration_seconds", "Duration of the last successful collection", nil, nil)
	descTimestamp    = prometheus.NewDesc("ceph_scrub_collect_timestamp_seconds", "Time of the last successful collection", nil, nil)
	descParseErrors  = prometheus.NewDesc("ceph_scrub_parse_errors", "Records skipped during the last successful collection", nil, nil)
	descIntervalOK   = prometheus.NewDesc("ceph_scrub_interval_read_success", "Whether the last read of the cluster's scrub intervals succeeded", nil, nil)
	descIntervalTime = prometheus.NewDesc("ceph_scrub_interval_read_timestamp_seconds", "Time of the last successful interval read", nil, nil)
)

// After this many consecutive failures the stale snapshot is dropped, so the
// instance's pool series go absent and query-side dedup stops preferring them.
const expireAfterFailures = 5

type exporterState struct {
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
	s.snapshot, s.duration, s.failed, s.consecutiveFails = snap, took, false, 0
	e.state.Store(&s)
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
	for pool, ps := range snap.Pools {
		ch <- prometheus.MustNewConstMetric(descPoolPGs, prometheus.GaugeValue, float64(ps.PGs), pool)
		ch <- prometheus.MustNewConstMetric(descPoolBytes, prometheus.GaugeValue, float64(ps.Bytes), pool)
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
			buckets := make(map[float64]uint64, len(AgeBuckets))
			for i, le := range AgeBuckets {
				buckets[le.Seconds()] = uint64(ps.AgeBucketBytes[depth][i])
			}
			ch <- prometheus.MustNewConstHistogram(descAgeHist, uint64(ps.ParsedBytes[depth]), ps.AgeSum[depth], buckets, pool, string(depth))
		}
	}
}
