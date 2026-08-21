package warp

import (
	"fmt"
	"strings"
	"time"

	"yuctl/fleet"
	warpfleet "yuctl/fleet/warp"
	"yuctl/ui"
)

// view renders StatusReports as a styled dashboard; watch mode feeds it
// successive samples and it keeps a throughput history for the sparkline.
type view struct {
	label   string
	history fleet.History
}

func (v *view) render(r *warpfleet.StatusReport, sampledAt time.Time, sampleSec int, watching bool) string {
	var b strings.Builder

	b.WriteString(ui.Badge.Render("WARP") + " " + ui.Title.Render(v.label) + "\n")

	if len(r.Pods) == 0 {
		b.WriteString(ui.Warn.Render("no runner pods deployed") +
			ui.Muted.Render("  — yuctl tools warp deploy") + "\n")
		return ui.Frame.Render(strings.TrimRight(b.String(), "\n"))
	}

	if r.Config != nil {
		since := r.Config["started_at"]
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			since = time.Since(t).Round(time.Second).String() + " ago"
		}
		fmt.Fprintf(&b, "%s %s · %s PUT / %s GET · %s/%s objects · %s RGWs\n",
			ui.OK.Render("● "+r.Config["mode"]),
			ui.Muted.Render("started "+since),
			r.Config["put_streams"], r.Config["get_streams"],
			r.Config["put_obj_size"], r.Config["get_obj_size"],
			r.Config["rgw_endpoints"])
		b.WriteString(ui.Muted.Render("endpoint "+r.Config["endpoint"]) + "\n")
	} else {
		b.WriteString(ui.Warn.Render("○ no active run recorded") +
			ui.Muted.Render("  — load stopped or never started") + "\n")
	}
	b.WriteString("\n")

	// Nodes: TX/RX bars scaled to the busiest direction in this frame.
	var maxBps float64
	for _, n := range r.Nodes {
		maxBps = max(maxBps, max(n.TxBps, n.RxBps))
	}
	nodeW, ifaceW := 4, 5
	for _, n := range r.Nodes {
		nodeW = max(nodeW, len(n.Node))
		ifaceW = max(ifaceW, len(n.Iface))
	}
	var tx, rx float64
	for _, n := range r.Nodes {
		fmt.Fprintf(&b, "%-*s %s  %s %s  %s %s\n",
			nodeW, n.Node,
			ui.Muted.Render(fmt.Sprintf("%-*s", ifaceW, n.Iface)),
			ui.TX.Render(ui.Meter(n.TxBps, maxBps, 14)),
			ui.PadGbps(n.TxBps),
			ui.RX.Render(ui.Meter(n.RxBps, maxBps, 14)),
			ui.PadGbps(n.RxBps))
		tx += n.TxBps
		rx += n.RxBps
	}
	if len(r.Nodes) > 0 {
		fmt.Fprintf(&b, "%s   %s %s · %s %s · %s\n",
			ui.Muted.Render(fmt.Sprintf("%-*s", nodeW+ifaceW-2, "aggregate")),
			ui.TX.Render("TX"), ui.PadGbps(tx),
			ui.RX.Render("RX"), ui.PadGbps(rx),
			ui.Total.Render("combined "+ui.FmtGbps(tx+rx)))
		if len(v.history.Values()) > 1 {
			b.WriteString(ui.Muted.Render("history   ") + ui.Total.Render(ui.Sparkline(v.history.Values(), 40)) + "\n")
		}
		b.WriteString("\n")
	}

	// Pods: process liveness and log error counts.
	podW := 3
	for _, p := range r.Pods {
		podW = max(podW, len(p.Name))
	}
	b.WriteString(ui.Muted.Render(fmt.Sprintf("%-*s %-*s %6s %6s %10s %10s", podW, "POD", nodeW, "NODE", "PUT", "GET", "ERR(PUT)", "ERR(GET)")) + "\n")
	for _, p := range r.Pods {
		fmt.Fprintf(&b, "%-*s %-*s %s %s %s %s\n",
			podW, p.Name, nodeW, p.Node,
			procCell(p.PutProcs, r.Config != nil),
			procCell(p.GetProcs, r.Config != nil),
			ui.ErrCell(p.PutErrors, 10), ui.ErrCell(p.GetErrors, 10))
	}

	b.WriteString("\n" + ui.Muted.Render(fleet.Footer(sampleSec, sampledAt, watching)))

	return ui.Frame.Render(b.String())
}

// procCell colors a warp process count: green when alive, red when a run is
// recorded but nothing is running, dim otherwise.
func procCell(n int, runRecorded bool) string {
	s := fmt.Sprintf("%6d", n)
	switch {
	case n > 0:
		return ui.OK.Render(s)
	case runRecorded:
		return ui.Bad.Render(s)
	default:
		return ui.Muted.Render(s)
	}
}
