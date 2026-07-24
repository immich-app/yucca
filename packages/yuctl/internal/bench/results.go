package bench

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"
	"time"
)

type PhaseResult struct {
	Name       string  `json:"name"`
	Seconds    float64 `json:"seconds"`
	Bytes      int64   `json:"bytes,omitempty"`      // payload the phase processed
	BytesAdded int64   `json:"bytesAdded,omitempty"` // backup: post-dedup bytes uploaded
	Throughput float64 `json:"throughput,omitempty"` // Bytes / Seconds
	SnapshotID string  `json:"snapshotId,omitempty"`
}

type CellResult struct {
	Connections int           `json:"connections"`
	Phases      []PhaseResult `json:"phases"`
}

type RunResult struct {
	Label         string         `json:"label"`
	Host          string         `json:"host"`
	RepoHost      string         `json:"repoHost"`
	ResticVersion string         `json:"resticVersion"`
	Created       time.Time      `json:"created"`
	Config        map[string]any `json:"config"`
	Cells         []CellResult   `json:"cells"`
	Cleanup       *PhaseResult   `json:"cleanup,omitempty"`
}

func SaveResult(path string, r *RunResult) error {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func LoadResult(path string) (*RunResult, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var r RunResult
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &r, nil
}

// scrubRepo strips the userinfo (the embedded JWT) from a rest: repository URL.
func scrubRepo(repo string) string {
	i := strings.Index(repo, "://")
	if i < 0 {
		return repo
	}
	rest := repo[i+3:]
	if j := strings.LastIndex(rest, "@"); j >= 0 {
		return repo[:i+3] + rest[j+1:]
	}
	return repo
}

// publicConfig is the result-embedded config: everything except credentials.
func publicConfig(c Config) map[string]any {
	return map[string]any{
		"size":            c.Size,
		"fileSize":        c.FileSize,
		"seed":            c.Seed,
		"connections":     c.Connections,
		"readConcurrency": c.ReadConcurrency,
		"packSizeMiB":     c.PackSizeMiB,
		"compression":     c.Compression,
		"incrementals":    c.Incrementals,
		"mutatePercent":   c.MutatePercent,
		"phases":          c.Phases,
		"workdir":         c.Workdir,
	}
}

func RenderSummary(w io.Writer, r *RunResult) {
	fmt.Fprintf(w, "\n%s  host=%s  repo=%s  restic=%s\n", r.Label, r.Host, r.RepoHost, r.ResticVersion)
	tw := tabwriter.NewWriter(w, 2, 4, 2, ' ', 0)
	fmt.Fprintln(tw, "CONNS\tPHASE\tDURATION\tBYTES\tUPLOADED\tTHROUGHPUT")
	for _, c := range r.Cells {
		for _, p := range c.Phases {
			fmt.Fprintf(tw, "%d\t%s\t%s\t%s\t%s\t%s\n",
				c.Connections, p.Name, FormatDuration(p.Seconds),
				orDash(p.Bytes), orDash(p.BytesAdded), bpsOrDash(p.Throughput))
		}
	}
	if r.Cleanup != nil {
		fmt.Fprintf(tw, "-\t%s\t%s\t%s\t%s\t%s\n",
			r.Cleanup.Name, FormatDuration(r.Cleanup.Seconds), orDash(r.Cleanup.Bytes), "-", "-")
	}
	tw.Flush()
}

// RenderCompare prints before/after deltas, matching cells by connections and
// phases by name.
func RenderCompare(w io.Writer, before, after *RunResult) {
	fmt.Fprintf(w, "\nbefore=%s (%s)  after=%s (%s)\n",
		before.Label, before.ResticVersion, after.Label, after.ResticVersion)
	tw := tabwriter.NewWriter(w, 2, 4, 2, ' ', 0)
	fmt.Fprintln(tw, "CONNS\tPHASE\tBEFORE\tAFTER\tDELTA\tTHROUGHPUT")
	for _, bc := range before.Cells {
		ac := findCell(after, bc.Connections)
		if ac == nil {
			continue
		}
		for _, bp := range bc.Phases {
			ap := findPhase(ac, bp.Name)
			if ap == nil {
				continue
			}
			delta := "-"
			if bp.Seconds > 0 {
				delta = fmt.Sprintf("%+.1f%%", (ap.Seconds-bp.Seconds)/bp.Seconds*100)
			}
			fmt.Fprintf(tw, "%d\t%s\t%s\t%s\t%s\t%s → %s\n",
				bc.Connections, bp.Name,
				FormatDuration(bp.Seconds), FormatDuration(ap.Seconds), delta,
				bpsOrDash(bp.Throughput), bpsOrDash(ap.Throughput))
		}
	}
	if before.Cleanup != nil && after.Cleanup != nil {
		b, a := before.Cleanup, after.Cleanup
		delta := "-"
		if b.Seconds > 0 {
			delta = fmt.Sprintf("%+.1f%%", (a.Seconds-b.Seconds)/b.Seconds*100)
		}
		fmt.Fprintf(tw, "-\t%s\t%s\t%s\t%s\t-\n", b.Name, FormatDuration(b.Seconds), FormatDuration(a.Seconds), delta)
	}
	tw.Flush()
}

func findCell(r *RunResult, conns int) *CellResult {
	for i := range r.Cells {
		if r.Cells[i].Connections == conns {
			return &r.Cells[i]
		}
	}
	return nil
}

func findPhase(c *CellResult, name string) *PhaseResult {
	for i := range c.Phases {
		if c.Phases[i].Name == name {
			return &c.Phases[i]
		}
	}
	return nil
}

func orDash(n int64) string {
	if n == 0 {
		return "-"
	}
	return FormatBytes(n)
}

func bpsOrDash(bps float64) string {
	if bps == 0 {
		return "-"
	}
	return FormatBPS(bps)
}
