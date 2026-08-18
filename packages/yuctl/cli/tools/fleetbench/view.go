package fleetbench

import (
	"fmt"
	"strings"
	"time"

	"yuctl/fleet"
	fbfleet "yuctl/fleet/fleetbench"
	"yuctl/resticbench"
	"yuctl/ui"
)

// view renders StatusReports as a styled dashboard; watch mode feeds it
// successive samples and it keeps a TX history for the sparkline.
type view struct {
	label   string
	history fleet.History
}

func (v *view) render(r *fbfleet.StatusReport, sampledAt time.Time, sampleSec int, watching bool) string {
	var b strings.Builder

	b.WriteString(ui.Badge.Render("FLEET-BENCH") + " " + ui.Title.Render(v.label) + "\n")

	if len(r.Hosts) == 0 {
		b.WriteString(ui.Warn.Render("no hosts deployed") +
			ui.Muted.Render("  — yuctl tools fleet-bench deploy") + "\n")
		return ui.Frame.Render(strings.TrimRight(b.String(), "\n"))
	}

	if r.Run != nil {
		since := time.Since(r.Run.StartedAt).Round(time.Second).String() + " ago"
		p := r.Run.Params
		b.WriteString(fmt.Sprintf("%s %s · %s objects · %s/cycle · %s clients/host · %s\n",
			ui.OK.Render("● "+r.Run.Label),
			ui.Muted.Render("started "+since),
			p["obj_size_mib"]+"MiB", p["cycle_size"], p["clients_per_host"], p["duration"]))
		b.WriteString(ui.Muted.Render("cap "+p["cap_per_host"]+" per host") + "\n")
	} else {
		b.WriteString(ui.Warn.Render("○ no active run recorded") +
			ui.Muted.Render("  — load stopped or never started") + "\n")
	}
	b.WriteString("\n")

	// Hosts: TX bar scaled to the busiest host, transfer budget bar scaled to
	// the cap.
	var maxBps float64
	nameW := 7
	for _, d := range r.Hosts {
		maxBps = max(maxBps, d.TxBps)
		nameW = max(nameW, len(d.Name))
	}
	var wire, capTotal int64
	var txBps float64
	for _, d := range r.Hosts {
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
			st := ui.OK
			switch {
			case pct >= 90:
				st = ui.Bad
			case pct >= 60:
				st = ui.Warn
			}
			budget = fmt.Sprintf("%s %s", st.Render(ui.Meter(float64(used), float64(capBytes), 10)), st.Render(fmt.Sprintf("%3.0f%%", pct)))
		}
		line := fmt.Sprintf("%-*s %s %s %s  %s %s  %s",
			nameW, d.Name,
			ui.Muted.Render(fmt.Sprintf("%-5s", d.Region)),
			ui.TX.Render(ui.Meter(d.TxBps, maxBps, 14)),
			ui.PadGbps(d.TxBps),
			budget,
			ui.Muted.Render(fmt.Sprintf("%9s", resticbench.FormatBytes(used))),
			stateCell(d, state))
		b.WriteString(line + "\n")
		txBps += d.TxBps
		wire += used
		capTotal += capBytes
	}
	b.WriteString(fmt.Sprintf("%s %s %s · %s\n",
		ui.Muted.Render(fmt.Sprintf("%-*s", nameW+6, "aggregate")),
		ui.TX.Render("TX"), ui.PadGbps(txBps),
		ui.Total.Render(fmt.Sprintf("pool %s / %s", resticbench.FormatBytes(wire), resticbench.FormatBytes(capTotal)))))
	if len(v.history.Values()) > 1 {
		b.WriteString(ui.Muted.Render("history   ") + ui.Total.Render(ui.Sparkline(v.history.Values(), 40)) + "\n")
	}
	b.WriteString("\n")

	// Clients: loop progress per restic identity.
	cnameW := 6
	for _, d := range r.Hosts {
		if d.Status == nil {
			continue
		}
		for _, c := range d.Status.Clients {
			cnameW = max(cnameW, len(fbfleet.ShortName(c.Name)))
		}
	}
	b.WriteString(ui.Muted.Render(fmt.Sprintf("%-*s %-9s %6s %10s %6s  %s", cnameW, "CLIENT", "PHASE", "CYCLES", "UPLOADED", "ERR", "LAST ERROR")) + "\n")
	for _, d := range r.Hosts {
		if d.Status == nil {
			if d.Err != "" {
				b.WriteString(fmt.Sprintf("%-*s %s\n", cnameW, fbfleet.ShortName(d.Name), ui.Bad.Render(d.Err)))
			}
			continue
		}
		for _, c := range d.Status.Clients {
			lastErr := ""
			if c.LastError != "" {
				lastErr = ui.Bad.Render(ui.Truncate(c.LastError, 48))
			}
			b.WriteString(fmt.Sprintf("%-*s %-9s %6d %10s %s  %s\n",
				cnameW, fbfleet.ShortName(c.Name), phaseCell(c.Phase), c.Cycles,
				resticbench.FormatBytes(c.Uploaded+c.CurrentBytes), ui.ErrCell(c.Errors, 6), lastErr))
		}
	}

	b.WriteString("\n" + ui.Muted.Render(fleet.Footer(sampleSec, sampledAt, watching)))

	return ui.Frame.Render(b.String())
}

func phaseCell(phase string) string {
	switch phase {
	case "backup":
		return ui.OK.Render(fmt.Sprintf("%-9s", phase))
	case "generate":
		return ui.TX.Render(fmt.Sprintf("%-9s", phase))
	default:
		return ui.Muted.Render(fmt.Sprintf("%-9s", phase))
	}
}

// stateCell colors the host's agent state, flagging a dead agent while a run
// is recorded.
func stateCell(d fbfleet.HostStatus, state string) string {
	switch {
	case !d.Reachable:
		return ui.Bad.Render("unreachable")
	case state == "running" && d.AgentProcs > 0:
		return ui.OK.Render("running")
	case state == "capped":
		return ui.Warn.Render("capped")
	case state == "done":
		return ui.Muted.Render("done")
	case d.AgentProcs == 0 && state == "running":
		return ui.Bad.Render("agent dead")
	default:
		return ui.Muted.Render(state)
	}
}
