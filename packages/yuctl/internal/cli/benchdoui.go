package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"yuctl/internal/bench"
	"yuctl/internal/benchdo"
)

// benchDoView renders StatusReports as a styled dashboard; watch mode feeds
// it successive samples and it keeps a TX history for the sparkline. Styling
// and the meter/sparkline primitives are shared with the warp view.
type benchDoView struct {
	label   string
	history []float64 // combined TX bps per sample
}

func (v *benchDoView) push(combined float64) {
	v.history = append(v.history, combined)
	if len(v.history) > 60 {
		v.history = v.history[len(v.history)-60:]
	}
}

func (v *benchDoView) render(r *benchdo.StatusReport, sampledAt time.Time, sampleSec int, watching bool) string {
	var b strings.Builder

	b.WriteString(warpBadge.Render("BENCH-DO") + " " + warpTitle.Render(v.label) + "\n")

	if len(r.Droplets) == 0 {
		b.WriteString(warpWarnSt.Render("no droplets deployed") +
			warpDimSt.Render("  — yuctl tools bench-do deploy") + "\n")
		return warpFrame.Render(strings.TrimRight(b.String(), "\n"))
	}

	if r.Run != nil {
		since := time.Since(r.Run.StartedAt).Round(time.Second).String() + " ago"
		p := r.Run.Params
		b.WriteString(fmt.Sprintf("%s %s · %s objects · %s/cycle · %s clients/droplet · %s\n",
			warpOKSt.Render("● "+r.Run.Label),
			warpDimSt.Render("started "+since),
			p["obj_size_mib"]+"MiB", p["cycle_size"], p["clients_per_droplet"], p["duration"]))
		b.WriteString(warpDimSt.Render("cap "+p["cap_per_droplet"]+" per droplet") + "\n")
	} else {
		b.WriteString(warpWarnSt.Render("○ no active run recorded") +
			warpDimSt.Render("  — load stopped or never started") + "\n")
	}
	b.WriteString("\n")

	// Droplets: TX bar scaled to the busiest droplet, transfer budget bar
	// scaled to the cap.
	var maxBps float64
	nameW := 7
	for _, d := range r.Droplets {
		maxBps = max(maxBps, d.TxBps)
		nameW = max(nameW, len(d.Name))
	}
	var wire, capTotal int64
	var txBps float64
	for _, d := range r.Droplets {
		capBytes := r.TransferCap
		var used int64
		state := "-"
		if d.Status != nil {
			used = d.Status.WireTxBytes
			if d.Status.CapBytes > 0 {
				capBytes = d.Status.CapBytes
			}
			state = d.Status.State
		}
		budget := "          "
		if capBytes > 0 {
			pct := float64(used) / float64(capBytes) * 100
			st := warpOKSt
			switch {
			case pct >= 90:
				st = warpErrSt
			case pct >= 60:
				st = warpWarnSt
			}
			budget = fmt.Sprintf("%s %s", st.Render(meter(float64(used), float64(capBytes), 10)), st.Render(fmt.Sprintf("%3.0f%%", pct)))
		}
		line := fmt.Sprintf("%-*s %s %s %s  %s %s  %s",
			nameW, d.Name,
			warpDimSt.Render(fmt.Sprintf("%-5s", d.Region)),
			warpTxSt.Render(meter(d.TxBps, maxBps, 14)),
			padGbps(d.TxBps),
			budget,
			warpDimSt.Render(fmt.Sprintf("%9s", bench.FormatBytes(used))),
			stateCell(d, state))
		b.WriteString(line + "\n")
		txBps += d.TxBps
		wire += used
		capTotal += capBytes
	}
	b.WriteString(fmt.Sprintf("%s %s %s · %s\n",
		warpDimSt.Render(fmt.Sprintf("%-*s", nameW+6, "aggregate")),
		warpTxSt.Render("TX"), padGbps(txBps),
		warpTotalSt.Render(fmt.Sprintf("pool %s / %s", bench.FormatBytes(wire), bench.FormatBytes(capTotal)))))
	if len(v.history) > 1 {
		b.WriteString(warpDimSt.Render("history   ") + warpTotalSt.Render(sparkline(v.history, 40)) + "\n")
	}
	b.WriteString("\n")

	// Clients: loop progress per restic identity.
	cnameW := 6
	for _, d := range r.Droplets {
		if d.Status == nil {
			continue
		}
		for _, c := range d.Status.Clients {
			cnameW = max(cnameW, len(shortClient(c.Name)))
		}
	}
	b.WriteString(warpDimSt.Render(fmt.Sprintf("%-*s %-9s %6s %10s %6s  %s", cnameW, "CLIENT", "PHASE", "CYCLES", "UPLOADED", "ERR", "LAST ERROR")) + "\n")
	for _, d := range r.Droplets {
		if d.Status == nil {
			if d.Err != "" {
				b.WriteString(fmt.Sprintf("%-*s %s\n", cnameW, shortClient(d.Name), warpErrSt.Render(d.Err)))
			}
			continue
		}
		for _, c := range d.Status.Clients {
			lastErr := ""
			if c.LastError != "" {
				lastErr = warpErrSt.Render(truncate(c.LastError, 48))
			}
			b.WriteString(fmt.Sprintf("%-*s %-9s %6d %10s %s  %s\n",
				cnameW, shortClient(c.Name), phaseCell(c.Phase), c.Cycles,
				bench.FormatBytes(c.Uploaded+c.CurrentBytes), errCell6(c.Errors), lastErr))
		}
	}

	footer := fmt.Sprintf("sampled %ds window at %s", sampleSec, sampledAt.Format("15:04:05"))
	if watching {
		footer += " · ctrl-c to quit"
	}
	b.WriteString("\n" + warpDimSt.Render(footer))

	return warpFrame.Render(b.String())
}

// shortClient drops the shared fleet prefix so tables stay narrow.
func shortClient(name string) string {
	return strings.TrimPrefix(name, "yucca-bench-do-")
}

func phaseCell(phase string) string {
	switch phase {
	case "backup":
		return warpOKSt.Render(fmt.Sprintf("%-9s", phase))
	case "generate":
		return warpTxSt.Render(fmt.Sprintf("%-9s", phase))
	default:
		return warpDimSt.Render(fmt.Sprintf("%-9s", phase))
	}
}

func errCell6(n int) string {
	s := fmt.Sprintf("%6d", n)
	if n > 0 {
		return warpErrSt.Render(s)
	}
	return warpDimSt.Render(s)
}

// stateCell colors the droplet's agent state, flagging a dead agent while a
// run is recorded.
func stateCell(d benchdo.DropletStatus, state string) string {
	switch {
	case !d.Reachable:
		return warpErrSt.Render("unreachable")
	case state == "running" && d.AgentProcs > 0:
		return warpOKSt.Render("running")
	case state == "capped":
		return warpWarnSt.Render("capped")
	case state == "done":
		return warpDimSt.Render("done")
	case d.AgentProcs == 0 && state == "running":
		return warpErrSt.Render("agent dead")
	default:
		return warpDimSt.Render(state)
	}
}

func saveBenchDoResult(path string, r *benchdo.Result) error {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func renderBenchDoResult(w io.Writer, r *benchdo.Result) {
	fmt.Fprintf(w, "\n%s  partition=%s  elapsed=%s\n", r.Label, r.Partition, bench.FormatDuration(r.ElapsedSeconds))
	tw := tabwriter.NewWriter(w, 2, 4, 2, ' ', 0)
	fmt.Fprintln(tw, "DROPLET\tREGION\tSTATE\tWIRE TX\tCLIENT\tCYCLES\tUPLOADED\tERRORS")
	for _, d := range r.Droplets {
		if len(d.Clients) == 0 {
			fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t-\t-\t-\t-\n",
				shortClient(d.Name), d.Region, d.State, bench.FormatBytes(d.WireTxBytes))
			continue
		}
		for i, c := range d.Clients {
			name, region, state, wireTx := shortClient(d.Name), d.Region, d.State, bench.FormatBytes(d.WireTxBytes)
			if i > 0 {
				name, region, state, wireTx = "", "", "", ""
			}
			fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\t%d\t%s\t%d\n",
				name, region, state, wireTx, "c"+strings.TrimPrefix(c.Name, d.Name+"-c"), c.Cycles,
				bench.FormatBytes(c.Uploaded), c.Errors)
		}
	}
	tw.Flush()
	fmt.Fprintf(w, "totals: uploaded=%s  wire-tx=%s  cycles=%d  errors=%d",
		bench.FormatBytes(r.TotalUploaded), bench.FormatBytes(r.TotalWireTx), r.TotalCycles, r.TotalErrors)
	if r.ElapsedSeconds > 0 && r.TotalUploaded > 0 {
		fmt.Fprintf(w, "  avg=%s", bench.FormatBPS(float64(r.TotalUploaded)/r.ElapsedSeconds))
	}
	fmt.Fprintln(w)
}
