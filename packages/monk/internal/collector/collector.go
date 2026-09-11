package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Ceph stamps carry +0000 rather than Z, and microsecond precision.
const stampLayout = "2006-01-02T15:04:05.999999-0700"

var AgeBuckets = []time.Duration{
	24 * time.Hour,
	3 * 24 * time.Hour,
	7 * 24 * time.Hour,
	14 * 24 * time.Hour,
	21 * 24 * time.Hour,
	28 * 24 * time.Hour,
	35 * 24 * time.Hour,
	49 * 24 * time.Hour,
	98 * 24 * time.Hour,
}

var scheduleStateNames = []string{"scheduled", "queued", "scrubbing", "blocked", "reserving", "none", "other"}

type Depth string

const (
	Shallow Depth = "shallow"
	Deep    Depth = "deep"
)

var Depths = []Depth{Shallow, Deep}

// Global and PerPool hold the overdue target, the only inputs monk's interval
// pins replace. Scheduler and Health mirror what the OSD scrub scheduler and
// the mgr's not-scrubbed health check read; neither daemon knows about the
// pins, so the pins must not move them.
type Intervals struct {
	Global    map[Depth]time.Duration
	PerPool   map[string]map[Depth]time.Duration
	Scheduler Policy
	Health    Policy
	// Set only by FetchIntervals; late and breach are withheld from snapshots
	// computed without it.
	FromCluster bool
}

// Policy is one daemon's reading of a scrub rule. A depth missing from
// Interval or Ratio was never read, which is not the same as zero: ceph
// accepts zero for every interval and ratio monk reads.
type Policy struct {
	Interval map[Depth]time.Duration
	PerPool  map[string]map[Depth]time.Duration
	Ratio    map[Depth]float64
}

// Ceph's own defaults, used for any input not yet read from the cluster.
const DefaultSchedulerMinInterval = 24 * time.Hour

var (
	DefaultIntervals       = map[Depth]time.Duration{Shallow: 7 * 24 * time.Hour, Deep: 7 * 24 * time.Hour}
	DefaultSchedulerRatios = map[Depth]float64{Shallow: 0.5, Deep: 0.2}
	DefaultWarnRatios      = map[Depth]float64{Shallow: 0.5, Deep: 0.75}
)

func (iv Intervals) For(pool string, d Depth) time.Duration {
	if overrides, ok := iv.PerPool[pool]; ok {
		if v, ok := overrides[d]; ok && v > 0 {
			return v
		}
	}
	return iv.Global[d]
}

// LatestTarget is the top of the window ceph's scheduler draws a PG's
// scheduled_at from, so a PG older than this was delayed past every target
// ceph could have drawn. Shallow draws uniformly from [min, min x (1 +
// randomize ratio)]; deep from a normal around the interval with sd interval
// x cv, clamped at 2 sd (ScrubJob::adjust_shallow_schedule /
// adjust_deep_schedule).
func (iv Intervals) LatestTarget(pool string, d Depth) time.Duration {
	fallback := DefaultIntervals[d]
	if d == Shallow {
		fallback = DefaultSchedulerMinInterval
	}
	spread := iv.Scheduler.ratio(d, DefaultSchedulerRatios[d])
	if d == Deep {
		spread *= 2
	}
	return stretch(iv.Scheduler.interval(pool, d, fallback), spread)
}

// Deadline is the age past which the mgr raises PG_NOT_SCRUBBED /
// PG_NOT_DEEP_SCRUBBED. A zero warn ratio disables that depth's check
// (PGMap::get_health_checks), reported as false.
func (iv Intervals) Deadline(pool string, d Depth) (time.Duration, bool) {
	ratio := iv.Health.ratio(d, DefaultWarnRatios[d])
	if ratio == 0 {
		return 0, false
	}
	return stretch(iv.Health.interval(pool, d, DefaultIntervals[d]), ratio), true
}

func (p Policy) interval(pool string, d Depth, fallback time.Duration) time.Duration {
	if v := p.PerPool[pool][d]; v > 0 {
		return v
	}
	if v, ok := p.Interval[d]; ok {
		return v
	}
	return fallback
}

func (p Policy) ratio(d Depth, fallback float64) float64 {
	if r, ok := p.Ratio[d]; ok {
		return r
	}
	return fallback
}

// Rounded because ratios such as 0.4 are inexact in binary, and truncation
// would land the threshold a nanosecond short.
func stretch(d time.Duration, ratio float64) time.Duration {
	return d + time.Duration(math.Round(float64(d)*ratio))
}

type pgStat struct {
	PGID               string `json:"pgid"`
	State              string `json:"state"`
	LastScrubStamp     string `json:"last_scrub_stamp"`
	LastDeepScrubStamp string `json:"last_deep_scrub_stamp"`
	ScrubSchedule      string `json:"scrub_schedule"`
	StatSum            struct {
		NumBytes     int64 `json:"num_bytes"`
		NumOmapBytes int64 `json:"num_omap_bytes"`
	} `json:"stat_sum"`
}

type pgLs struct {
	PGStats []pgStat `json:"pg_stats"`
}

type poolDetail struct {
	PoolID  int64 `json:"pool_id"`
	Options struct {
		ScrubMinInterval  float64 `json:"scrub_min_interval"`
		ScrubMaxInterval  float64 `json:"scrub_max_interval"`
		DeepScrubInterval float64 `json:"deep_scrub_interval"`
	} `json:"options"`
}

type PoolStats struct {
	PGs   int
	Bytes int64
	// Omap is tracked apart from Bytes because num_bytes excludes it: an
	// index pool reports zero data bytes while holding the whole bucket
	// listing, so byte-weighted coverage cannot see it fall behind.
	OmapBytes        int64
	OverdueOmapBytes map[Depth]int64
	Interval         map[Depth]time.Duration
	LatestTarget     map[Depth]time.Duration
	// A depth absent from Deadline has its health check disabled.
	Deadline    map[Depth]time.Duration
	OldestStamp map[Depth]time.Time
	// Three thresholds on the same stamp age, in an order that differs by
	// depth and configuration. Overdue is past the target interval: work
	// outstanding, with a nonzero floor on a healthy cluster because ceph
	// randomizes eligibility past the interval and pushes deferred targets,
	// so it must not drive a verdict. Late is past LatestTarget, the top of
	// ceph's randomized scheduling window: every target ceph could have drawn
	// has passed, so the PG is behind whatever the cause. Breach is past the
	// mgr's warn deadline: the health check is firing.
	OverduePGs   map[Depth]int
	OverdueBytes map[Depth]int64
	LatePGs      map[Depth]int
	LateBytes    map[Depth]int64
	MaxLate      map[Depth]time.Duration
	BreachPGs    map[Depth]int
	BreachBytes  map[Depth]int64
	// The age histogram observes each stored byte at its PG's scrub age; PGs
	// with unparsable stamps are excluded, and AgeBucketBytes is indexed like
	// AgeBuckets.
	ParsedBytes    map[Depth]int64
	AgeSum         map[Depth]float64
	AgeBucketBytes map[Depth][]int64
}

type Snapshot struct {
	Taken          time.Time
	Pools          map[string]*PoolStats
	ScheduleStates map[string]int
	ParseErrors    int
	FromCluster    bool
	// PGState carries the per-PG stamps forward so the next refresh can count
	// which PGs actually completed a scrub, which is the only measured way to
	// answer how fast the backlog is draining.
	PGState map[string]PGState
}

// Two fields rather than a map keyed by Depth: this is allocated once per PG
// per refresh, so on a cluster with thousands of PGs the map header and bucket
// dominate the struct it holds. A zero stamp means the depth was unparsable.
type PGState struct {
	Pool    string
	Bytes   int64
	Shallow time.Time
	Deep    time.Time
}

func (p PGState) StampAt(d Depth) (time.Time, bool) {
	t := p.Shallow
	if d == Deep {
		t = p.Deep
	}
	return t, !t.IsZero()
}

func (p *PGState) setStamp(d Depth, t time.Time) {
	if d == Deep {
		p.Deep = t
		return
	}
	p.Shallow = t
}

func cephOutput(ctx context.Context, cephCmd []string, args ...string) ([]byte, error) {
	full := slices.Concat(cephCmd[1:], args)
	cmd := exec.CommandContext(ctx, cephCmd[0], full...)
	// A wrapper cephCmd (cephadm shell) spawns grandchildren that inherit
	// stdout: kill the whole process group on cancel so none leak. A group
	// already gone (ESRCH) means the process finished; reporting it as a
	// cancellation error would turn a successful exit into a failure.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); !errors.Is(err, syscall.ESRCH) {
			return err
		}
		return os.ErrProcessDone
	}
	cmd.WaitDelay = time.Second
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := errors.AsType[*exec.ExitError](err); ok {
			return out, fmt.Errorf("%s %s: %w: %s", cephCmd[0], args[0], err, strings.TrimSpace(string(ee.Stderr)))
		}
		return out, fmt.Errorf("%s %s: %w", cephCmd[0], args[0], err)
	}
	return out, nil
}

// An ErrWaitDelay after a clean exit means the pipes closed before I/O
// completed, so the output may be a truncated prefix. Only this JSON path
// tolerates it, because Compute's json.Unmarshal fails safe on truncation;
// interval reads have no such completeness check and treat it as a hard
// error, keeping the last-known thresholds.
func Fetch(ctx context.Context, cephCmd []string) ([]byte, error) {
	out, err := cephOutput(ctx, cephCmd, "pg", "ls", "-f", "json")
	if err != nil && errors.Is(err, exec.ErrWaitDelay) && len(out) > 0 {
		return out, nil
	}
	return out, err
}

// FetchIntervals reads each input from the config section of the daemon that
// acts on it: the osd view for the overdue target and the scrub scheduler,
// the mgr view for the not-scrubbed health check (computed in the mgr, whose
// value can differ from the osds'), and the pool options that override both.
func FetchIntervals(ctx context.Context, cephCmd []string) (Intervals, error) {
	var err error
	seconds := func(section, option string) time.Duration {
		return configValue(ctx, cephCmd, &err, section, option, parseIntervalSeconds)
	}
	ratio := func(section, option string) float64 {
		return configValue(ctx, cephCmd, &err, section, option, parseRatio)
	}
	deepInterval := seconds("osd", "osd_deep_scrub_interval")
	iv := Intervals{
		Global: map[Depth]time.Duration{
			Shallow: seconds("osd", "osd_scrub_max_interval"),
			Deep:    deepInterval,
		},
		Scheduler: Policy{
			Interval: map[Depth]time.Duration{
				Shallow: seconds("osd", "osd_scrub_min_interval"),
				Deep:    deepInterval,
			},
			Ratio: map[Depth]float64{
				Shallow: ratio("osd", "osd_scrub_interval_randomize_ratio"),
				Deep:    ratio("osd", "osd_deep_scrub_interval_cv"),
			},
		},
		Health: Policy{
			Interval: map[Depth]time.Duration{
				Shallow: seconds("mgr", "osd_scrub_max_interval"),
				Deep:    seconds("mgr", "osd_deep_scrub_interval"),
			},
			Ratio: map[Depth]float64{
				Shallow: ratio("mgr", "mon_warn_pg_not_scrubbed_ratio"),
				Deep:    ratio("mgr", "mon_warn_pg_not_deep_scrubbed_ratio"),
			},
		},
	}
	if err != nil {
		return Intervals{}, err
	}
	out, err := cephOutput(ctx, cephCmd, "osd", "pool", "ls", "detail", "-f", "json")
	if err != nil {
		return Intervals{}, err
	}
	if err := iv.setPoolOverrides(out); err != nil {
		return Intervals{}, err
	}
	iv.FromCluster = true
	return iv, nil
}

// configValue does nothing once *errp is set, so a run of reads stays
// all-or-nothing without a check after each one.
func configValue[T any](ctx context.Context, cephCmd []string, errp *error, section, option string, parse func(string) (T, error)) T {
	var v T
	if *errp != nil {
		return v
	}
	out, err := cephOutput(ctx, cephCmd, "config", "get", section, option)
	if err == nil {
		if v, err = parse(string(out)); err != nil {
			err = fmt.Errorf("%s %s: %w", section, option, err)
		}
	}
	*errp = err
	return v
}

// Zero is a real value, not an unset marker: ceph uses a zero config interval
// as is (eligible at once, warned at once); only a pool option treats zero as
// unset.
func parseIntervalSeconds(s string) (time.Duration, error) {
	secs, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return 0, fmt.Errorf("parse interval %q: %w", s, err)
	}
	if secs < 0 {
		return 0, fmt.Errorf("interval %q is negative", s)
	}
	return time.Duration(secs * float64(time.Second)), nil
}

// Zero is a real value for every ratio monk reads, never an unset marker: a
// zero mon_warn_pg_not_*scrubbed_ratio disables that depth's not-scrubbed
// check, and a zero scheduler ratio removes the randomization. Negative would
// move a threshold before its interval.
func parseRatio(s string) (float64, error) {
	ratio, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return 0, fmt.Errorf("parse ratio %q: %w", s, err)
	}
	if ratio < 0 {
		return 0, fmt.Errorf("ratio %q is negative", s)
	}
	return ratio, nil
}

// Each view gets maps of its own: main's applyPins deletes pinned depths from
// PerPool, and the pins must not reach what the scheduler and the mgr read.
func (iv *Intervals) setPoolOverrides(raw []byte) error {
	var pools []poolDetail
	if err := json.Unmarshal(raw, &pools); err != nil {
		return fmt.Errorf("parse pool ls detail: %w", err)
	}
	iv.PerPool = map[string]map[Depth]time.Duration{}
	iv.Health.PerPool = map[string]map[Depth]time.Duration{}
	iv.Scheduler.PerPool = map[string]map[Depth]time.Duration{}
	for _, p := range pools {
		id := strconv.FormatInt(p.PoolID, 10)
		o := p.Options
		addPoolOverrides(iv.PerPool, id, o.ScrubMaxInterval, o.DeepScrubInterval)
		addPoolOverrides(iv.Health.PerPool, id, o.ScrubMaxInterval, o.DeepScrubInterval)
		addPoolOverrides(iv.Scheduler.PerPool, id, o.ScrubMinInterval, o.DeepScrubInterval)
	}
	return nil
}

func addPoolOverrides(perPool map[string]map[Depth]time.Duration, pool string, shallowSecs, deepSecs float64) {
	overrides := map[Depth]time.Duration{}
	for d, secs := range map[Depth]float64{Shallow: shallowSecs, Deep: deepSecs} {
		if secs > 0 {
			overrides[d] = time.Duration(secs * float64(time.Second))
		}
	}
	if len(overrides) > 0 {
		perPool[pool] = overrides
	}
}

func Compute(raw []byte, now time.Time, intervals Intervals) (*Snapshot, error) {
	var data pgLs
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("parse pg ls: %w", err)
	}
	if len(data.PGStats) == 0 {
		return nil, errors.New("pg ls returned no pg_stats")
	}

	snap := &Snapshot{
		Taken:          now,
		FromCluster:    intervals.FromCluster,
		Pools:          map[string]*PoolStats{},
		ScheduleStates: map[string]int{},
		PGState:        make(map[string]PGState, len(data.PGStats)),
	}
	for _, state := range scheduleStateNames {
		snap.ScheduleStates[state] = 0
	}
	for _, pg := range data.PGStats {
		pool, _, ok := strings.Cut(pg.PGID, ".")
		if !ok {
			snap.ParseErrors++
			continue
		}
		ps := snap.Pools[pool]
		if ps == nil {
			ps = newPoolStats(pool, intervals)
			snap.Pools[pool] = ps
		}
		// PG stats go transiently negative under split/backfill churn; a
		// negative value would wrap the histogram's uint64 buckets.
		bytes := max(pg.StatSum.NumBytes, 0)
		omap := max(pg.StatSum.NumOmapBytes, 0)
		ps.PGs++
		ps.Bytes += bytes
		ps.OmapBytes += omap
		snap.ScheduleStates[scheduleState(pg.ScrubSchedule)]++
		pgs := PGState{Pool: pool, Bytes: bytes}

		for _, stamped := range [...]struct {
			depth Depth
			value string
		}{{Shallow, pg.LastScrubStamp}, {Deep, pg.LastDeepScrubStamp}} {
			depth, stampStr := stamped.depth, stamped.value
			stamp, err := time.Parse(stampLayout, stampStr)
			if err != nil {
				// Unparsable stamps count as overdue but neither late nor
				// breach: both claims need an established age, and
				// ceph_scrub_parse_errors already carries the data-quality
				// signal.
				snap.ParseErrors++
				ps.OverduePGs[depth]++
				ps.OverdueBytes[depth] += bytes
				ps.OverdueOmapBytes[depth] += omap
				continue
			}
			if old, ok := ps.OldestStamp[depth]; !ok || stamp.Before(old) {
				ps.OldestStamp[depth] = stamp
			}
			age := max(now.Sub(stamp), 0)
			if age > ps.Interval[depth] {
				ps.OverduePGs[depth]++
				ps.OverdueBytes[depth] += bytes
				ps.OverdueOmapBytes[depth] += omap
			}
			if late := age - ps.LatestTarget[depth]; late > 0 {
				ps.LatePGs[depth]++
				ps.LateBytes[depth] += bytes
				ps.MaxLate[depth] = max(ps.MaxLate[depth], late)
			}
			if deadline, ok := ps.Deadline[depth]; ok && age > deadline {
				ps.BreachPGs[depth]++
				ps.BreachBytes[depth] += bytes
			}
			pgs.setStamp(depth, stamp)
			ps.ParsedBytes[depth] += bytes
			ps.AgeSum[depth] += age.Seconds() * float64(bytes)
			for i, le := range AgeBuckets {
				if age <= le {
					ps.AgeBucketBytes[depth][i] += bytes
				}
			}
		}
		snap.PGState[pg.PGID] = pgs
	}
	// A correlated parse failure (a stamp-format change) must read as an
	// outage, not as the whole cluster suddenly overdue.
	if attempts := 2 * len(data.PGStats); snap.ParseErrors*5 > attempts {
		return nil, fmt.Errorf("%d of %d stamp fields failed to parse", snap.ParseErrors, attempts)
	}
	return snap, nil
}

func newPoolStats(pool string, intervals Intervals) *PoolStats {
	ps := &PoolStats{
		Interval:         map[Depth]time.Duration{},
		LatestTarget:     map[Depth]time.Duration{},
		Deadline:         map[Depth]time.Duration{},
		OldestStamp:      map[Depth]time.Time{},
		OverduePGs:       map[Depth]int{},
		OverdueBytes:     map[Depth]int64{},
		OverdueOmapBytes: map[Depth]int64{},
		LatePGs:          map[Depth]int{},
		LateBytes:        map[Depth]int64{},
		MaxLate:          map[Depth]time.Duration{},
		BreachPGs:        map[Depth]int{},
		BreachBytes:      map[Depth]int64{},
		ParsedBytes:      map[Depth]int64{},
		AgeSum:           map[Depth]float64{},
		AgeBucketBytes:   map[Depth][]int64{},
	}
	for _, d := range Depths {
		ps.Interval[d] = intervals.For(pool, d)
		ps.LatestTarget[d] = intervals.LatestTarget(pool, d)
		if deadline, ok := intervals.Deadline(pool, d); ok {
			ps.Deadline[d] = deadline
		}
		ps.AgeBucketBytes[d] = make([]int64, len(AgeBuckets))
	}
	return ps
}

func scheduleState(s string) string {
	switch {
	case s == "" || s == "--" || strings.Contains(s, "no scrub"):
		return "none"
	case strings.Contains(s, "scheduled @"):
		return "scheduled"
	case strings.HasPrefix(s, "queued"):
		return "queued"
	case strings.Contains(s, "scrubbing"):
		return "scrubbing"
	case strings.HasPrefix(s, "Blocked"):
		return "blocked"
	case strings.HasPrefix(s, "Reserving"):
		return "reserving"
	default:
		return "other"
	}
}
