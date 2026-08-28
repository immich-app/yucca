package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"slices"
	"strings"
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
}

type Depth string

const (
	Shallow Depth = "shallow"
	Deep    Depth = "deep"
)

var Depths = []Depth{Shallow, Deep}

type pgStat struct {
	PGID               string `json:"pgid"`
	State              string `json:"state"`
	LastScrubStamp     string `json:"last_scrub_stamp"`
	LastDeepScrubStamp string `json:"last_deep_scrub_stamp"`
	ScrubSchedule      string `json:"scrub_schedule"`
	StatSum            struct {
		NumBytes int64 `json:"num_bytes"`
	} `json:"stat_sum"`
}

type pgLs struct {
	PGStats []pgStat `json:"pg_stats"`
}

type PoolStats struct {
	PGs          int
	Bytes        int64
	OldestStamp  map[Depth]time.Time
	OverduePGs   map[Depth]int
	OverdueBytes map[Depth]int64
	// Age histogram weighted by bytes: each stored byte observes its PG's scrub
	// age. ParsedBytes is the observation count (PGs with unparsable stamps are
	// excluded), AgeSum the sum, AgeBucketBytes the cumulative buckets indexed
	// like AgeBuckets.
	ParsedBytes    map[Depth]int64
	AgeSum         map[Depth]float64
	AgeBucketBytes map[Depth][]int64
}

type Snapshot struct {
	Taken          time.Time
	Pools          map[string]*PoolStats
	ScheduleStates map[string]int
	ParseErrors    int
}

func Fetch(ctx context.Context, cephCmd []string) ([]byte, error) {
	args := slices.Concat(cephCmd[1:], []string{"pg", "ls", "-f", "json"})
	cmd := exec.CommandContext(ctx, cephCmd[0], args...)
	// A wrapper cephCmd (cephadm shell) leaves a grandchild holding stdout past
	// the context kill; WaitDelay lets Output return anyway.
	cmd.WaitDelay = time.Second
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("%s: %w: %s", cephCmd[0], err, strings.TrimSpace(string(ee.Stderr)))
		}
		return nil, fmt.Errorf("%s: %w", cephCmd[0], err)
	}
	return out, nil
}

func Compute(raw []byte, now time.Time, intervals map[Depth]time.Duration) (*Snapshot, error) {
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
				OldestStamp:    map[Depth]time.Time{},
				OverduePGs:     map[Depth]int{},
				OverdueBytes:   map[Depth]int64{},
				ParsedBytes:    map[Depth]int64{},
				AgeSum:         map[Depth]float64{},
				AgeBucketBytes: map[Depth][]int64{Shallow: make([]int64, len(AgeBuckets)), Deep: make([]int64, len(AgeBuckets))},
			}
			snap.Pools[pool] = ps
		}
		ps.PGs++
		ps.Bytes += pg.StatSum.NumBytes
		snap.ScheduleStates[scheduleState(pg.ScrubSchedule)]++

		for depth, stampStr := range map[Depth]string{Shallow: pg.LastScrubStamp, Deep: pg.LastDeepScrubStamp} {
			stamp, err := time.Parse(stampLayout, stampStr)
			if err != nil {
				snap.ParseErrors++
				ps.OverduePGs[depth]++
				ps.OverdueBytes[depth] += pg.StatSum.NumBytes
				continue
			}
			if old, ok := ps.OldestStamp[depth]; !ok || stamp.Before(old) {
				ps.OldestStamp[depth] = stamp
			}
			age := now.Sub(stamp)
			if age > intervals[depth] {
				ps.OverduePGs[depth]++
				ps.OverdueBytes[depth] += pg.StatSum.NumBytes
			}
			ps.ParsedBytes[depth] += pg.StatSum.NumBytes
			ps.AgeSum[depth] += age.Seconds() * float64(pg.StatSum.NumBytes)
			for i, le := range AgeBuckets {
				if age <= le {
					ps.AgeBucketBytes[depth][i] += pg.StatSum.NumBytes
				}
			}
		}
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
