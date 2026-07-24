// Package bench drives restic end-to-end benchmarks against michael: an
// orchestrator on the dev machine pushes an agent (yucca-bench itself, built
// for linux) plus a pinned restic binary to a management host, runs
// write/incremental/restore phases there, and reports results locally.
package bench

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

var sizeUnits = map[string]int64{
	"":    1,
	"b":   1,
	"kib": 1 << 10,
	"mib": 1 << 20,
	"gib": 1 << 30,
	"tib": 1 << 40,
	"kb":  1e3,
	"mb":  1e6,
	"gb":  1e9,
	"tb":  1e12,
}

// ParseSize parses "1TiB", "64MiB", "500GB", or plain bytes.
func ParseSize(s string) (int64, error) {
	t := strings.ToLower(strings.TrimSpace(s))
	i := len(t)
	for i > 0 && (t[i-1] < '0' || t[i-1] > '9') {
		i--
	}
	num, unit := t[:i], strings.TrimSpace(t[i:])
	mult, ok := sizeUnits[unit]
	if !ok {
		return 0, fmt.Errorf("unknown size unit %q in %q", unit, s)
	}
	n, err := strconv.ParseInt(num, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid size %q", s)
	}
	return n * mult, nil
}

func FormatBytes(n int64) string {
	f := float64(n)
	for _, u := range []string{"B", "KiB", "MiB", "GiB", "TiB"} {
		if f < 1024 || u == "TiB" {
			if u == "B" {
				return fmt.Sprintf("%d %s", n, u)
			}
			return fmt.Sprintf("%.1f %s", f, u)
		}
		f /= 1024
	}
	return fmt.Sprintf("%d B", n)
}

func FormatBPS(bps float64) string {
	for _, u := range []string{"B/s", "KiB/s", "MiB/s", "GiB/s"} {
		if bps < 1024 || u == "GiB/s" {
			return fmt.Sprintf("%.1f %s", bps, u)
		}
		bps /= 1024
	}
	return ""
}

func FormatDuration(seconds float64) string {
	d := time.Duration(seconds * float64(time.Second)).Round(time.Second)
	if d >= time.Hour {
		return fmt.Sprintf("%dh%02dm%02ds", int(d.Hours()), int(d.Minutes())%60, int(d.Seconds())%60)
	}
	if d >= time.Minute {
		return fmt.Sprintf("%dm%02ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%.1fs", seconds)
}
