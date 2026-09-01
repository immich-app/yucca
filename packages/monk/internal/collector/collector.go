package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

type Intervals struct {
	Global  map[Depth]time.Duration
	PerPool map[string]map[Depth]time.Duration
}

func (iv Intervals) For(pool string, d Depth) time.Duration {
	if overrides, ok := iv.PerPool[pool]; ok {
		if v, ok := overrides[d]; ok && v > 0 {
			return v
		}
	}
	return iv.Global[d]
}

var intervalOptions = map[Depth]string{
	Shallow: "osd_scrub_max_interval",
	Deep:    "osd_deep_scrub_interval",
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
	OldestStamp      map[Depth]time.Time
	OverduePGs       map[Depth]int
	OverdueBytes     map[Depth]int64
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
	// PGState carries the per-PG stamps forward so the next refresh can count
	// which PGs actually completed a scrub, which is the only measured way to
	// answer how fast the backlog is draining.
	PGState map[string]PGState
}

type PGState struct {
	Pool  string
	Bytes int64
	Stamp map[Depth]time.Time
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
		if ee, ok := err.(*exec.ExitError); ok {
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

// FetchIntervals reads the overdue policy from the cluster itself: the osd
// section's effective intervals plus per-pool option overrides, so monk's
// thresholds cannot drift from what the scrub scheduler actually targets.
func FetchIntervals(ctx context.Context, cephCmd []string) (Intervals, error) {
	iv := Intervals{Global: map[Depth]time.Duration{}, PerPool: map[string]map[Depth]time.Duration{}}
	for depth, option := range intervalOptions {
		out, err := cephOutput(ctx, cephCmd, "config", "get", "osd", option)
		if err != nil {
			return Intervals{}, err
		}
		d, err := parseIntervalSeconds(string(out))
		if err != nil {
			return Intervals{}, fmt.Errorf("%s: %w", option, err)
		}
		iv.Global[depth] = d
	}
	out, err := cephOutput(ctx, cephCmd, "osd", "pool", "ls", "detail", "-f", "json")
	if err != nil {
		return Intervals{}, err
	}
	perPool, err := parsePoolIntervals(out)
	if err != nil {
		return Intervals{}, err
	}
	iv.PerPool = perPool
	return iv, nil
}

func parseIntervalSeconds(s string) (time.Duration, error) {
	secs, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return 0, fmt.Errorf("parse interval %q: %w", s, err)
	}
	if secs <= 0 {
		return 0, fmt.Errorf("interval %q is not positive", s)
	}
	return time.Duration(secs * float64(time.Second)), nil
}

func parsePoolIntervals(raw []byte) (map[string]map[Depth]time.Duration, error) {
	var pools []poolDetail
	if err := json.Unmarshal(raw, &pools); err != nil {
		return nil, fmt.Errorf("parse pool ls detail: %w", err)
	}
	perPool := map[string]map[Depth]time.Duration{}
	for _, p := range pools {
		overrides := map[Depth]time.Duration{}
		if p.Options.ScrubMaxInterval > 0 {
			overrides[Shallow] = time.Duration(p.Options.ScrubMaxInterval * float64(time.Second))
		}
		if p.Options.DeepScrubInterval > 0 {
			overrides[Deep] = time.Duration(p.Options.DeepScrubInterval * float64(time.Second))
		}
		if len(overrides) > 0 {
			perPool[strconv.FormatInt(p.PoolID, 10)] = overrides
		}
	}
	return perPool, nil
}

func Compute(raw []byte, now time.Time, intervals Intervals) (*Snapshot, error) {
	var data pgLs
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("parse pg ls: %w", err)
	}
	if len(data.PGStats) == 0 {
		return nil, fmt.Errorf("pg ls returned no pg_stats")
	}

	snap := &Snapshot{
		Taken:          now,
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
			ps = &PoolStats{
				Interval: map[Depth]time.Duration{
					Shallow: intervals.For(pool, Shallow),
					Deep:    intervals.For(pool, Deep),
				},
				OldestStamp:      map[Depth]time.Time{},
				OverduePGs:       map[Depth]int{},
				OverdueBytes:     map[Depth]int64{},
				OverdueOmapBytes: map[Depth]int64{},
				ParsedBytes:      map[Depth]int64{},
				AgeSum:           map[Depth]float64{},
				AgeBucketBytes:   map[Depth][]int64{Shallow: make([]int64, len(AgeBuckets)), Deep: make([]int64, len(AgeBuckets))},
			}
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
		pgs := PGState{Pool: pool, Bytes: bytes, Stamp: map[Depth]time.Time{}}

		for depth, stampStr := range map[Depth]string{Shallow: pg.LastScrubStamp, Deep: pg.LastDeepScrubStamp} {
			stamp, err := time.Parse(stampLayout, stampStr)
			if err != nil {
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
			pgs.Stamp[depth] = stamp
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
