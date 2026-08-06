package cli

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"

	"yuctl/internal/warp"
)

// warpView renders StatusReports as a styled dashboard; watch mode feeds it
// successive samples and it keeps a throughput history for the sparkline.
type warpView struct {
	label   string
	history []float64 // combined bps per sample
}

var (
	warpAccent = lipgloss.AdaptiveColor{Light: "#6C50FF", Dark: "#9D7CFF"}
	warpOK     = lipgloss.AdaptiveColor{Light: "#12A150", Dark: "#2ECC71"}
	warpErr    = lipgloss.AdaptiveColor{Light: "#D0021B", Dark: "#FF5F56"}
	warpWarn   = lipgloss.AdaptiveColor{Light: "#B8860B", Dark: "#F5C542"}
	warpDim    = lipgloss.AdaptiveColor{Light: "244", Dark: "241"}
	warpTx     = lipgloss.AdaptiveColor{Light: "#0087AF", Dark: "#33D1E0"}
	warpRx     = lipgloss.AdaptiveColor{Light: "#AF5F00", Dark: "#F5A623"}

	warpBadge   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FFFFFF")).Background(warpAccent).Padding(0, 1)
	warpTitle   = lipgloss.NewStyle().Bold(true)
	warpDimSt   = lipgloss.NewStyle().Foreground(warpDim)
	warpOKSt    = lipgloss.NewStyle().Foreground(warpOK)
	warpErrSt   = lipgloss.NewStyle().Bold(true).Foreground(warpErr)
	warpWarnSt  = lipgloss.NewStyle().Foreground(warpWarn)
	warpTxSt    = lipgloss.NewStyle().Foreground(warpTx)
	warpRxSt    = lipgloss.NewStyle().Foreground(warpRx)
	warpTotalSt = lipgloss.NewStyle().Bold(true).Foreground(warpAccent)
	warpFrame   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(warpAccent).Padding(0, 1)
)

func (v *warpView) push(combined float64) {
	v.history = append(v.history, combined)
	if len(v.history) > 60 {
		v.history = v.history[len(v.history)-60:]
	}
}

func (v *warpView) render(r *warp.StatusReport, sampledAt time.Time, sampleSec int, watching bool) string {
	var b strings.Builder

	b.WriteString(warpBadge.Render("WARP") + " " + warpTitle.Render(v.label) + "\n")

	if len(r.Pods) == 0 {
		b.WriteString(warpWarnSt.Render("no runner pods deployed") +
			warpDimSt.Render("  — yuctl tools warp deploy") + "\n")
		return warpFrame.Render(strings.TrimRight(b.String(), "\n"))
	}

	if r.Config != nil {
		since := r.Config["started_at"]
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			since = time.Since(t).Round(time.Second).String() + " ago"
		}
		b.WriteString(fmt.Sprintf("%s %s · %s PUT / %s GET · %s/%s objects · %s RGWs\n",
			warpOKSt.Render("● "+r.Config["mode"]),
			warpDimSt.Render("started "+since),
			r.Config["put_streams"], r.Config["get_streams"],
			r.Config["put_obj_size"], r.Config["get_obj_size"],
			r.Config["rgw_endpoints"]))
		b.WriteString(warpDimSt.Render("endpoint "+r.Config["endpoint"]) + "\n")
	} else {
		b.WriteString(warpWarnSt.Render("○ no active run recorded") +
			warpDimSt.Render("  — load stopped or never started") + "\n")
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
		b.WriteString(fmt.Sprintf("%-*s %s  %s %s  %s %s\n",
			nodeW, n.Node,
			warpDimSt.Render(fmt.Sprintf("%-*s", ifaceW, n.Iface)),
			warpTxSt.Render(meter(n.TxBps, maxBps, 14)),
			padGbps(n.TxBps),
			warpRxSt.Render(meter(n.RxBps, maxBps, 14)),
			padGbps(n.RxBps)))
		tx += n.TxBps
		rx += n.RxBps
	}
	if len(r.Nodes) > 0 {
		b.WriteString(fmt.Sprintf("%s   %s %s · %s %s · %s\n",
			warpDimSt.Render(fmt.Sprintf("%-*s", nodeW+ifaceW-2, "aggregate")),
			warpTxSt.Render("TX"), padGbps(tx),
			warpRxSt.Render("RX"), padGbps(rx),
			warpTotalSt.Render("combined "+fmtGbps(tx+rx))))
		if len(v.history) > 1 {
			b.WriteString(warpDimSt.Render("history   ") + warpTotalSt.Render(sparkline(v.history, 40)) + "\n")
		}
		b.WriteString("\n")
	}

	podW := 3
	for _, p := range r.Pods {
		podW = max(podW, len(p.Name))
	}
	b.WriteString(warpDimSt.Render(fmt.Sprintf("%-*s %-*s %6s %6s %10s %10s", podW, "POD", nodeW, "NODE", "PUT", "GET", "ERR(PUT)", "ERR(GET)")) + "\n")
	for _, p := range r.Pods {
		b.WriteString(fmt.Sprintf("%-*s %-*s %s %s %s %s\n",
			podW, p.Name, nodeW, p.Node,
			procCell(p.PutProcs, r.Config != nil),
			procCell(p.GetProcs, r.Config != nil),
			errCell(p.PutErrors), errCell(p.GetErrors)))
	}

	footer := fmt.Sprintf("sampled %ds window at %s", sampleSec, sampledAt.Format("15:04:05"))
	if watching {
		footer += " · ctrl-c to quit"
	}
	b.WriteString("\n" + warpDimSt.Render(footer))

	return warpFrame.Render(b.String())
}

// procCell colors a warp process count: green when alive, red when a run is
// recorded but nothing is running, dim otherwise.
func procCell(n int, runRecorded bool) string {
	s := fmt.Sprintf("%6d", n)
	switch {
	case n > 0:
		return warpOKSt.Render(s)
	case runRecorded:
		return warpErrSt.Render(s)
	default:
		return warpDimSt.Render(s)
	}
}

func errCell(n int) string {
	s := fmt.Sprintf("%10d", n)
	if n > 0 {
		return warpErrSt.Render(s)
	}
	return warpDimSt.Render(s)
}

func fmtGbps(bps float64) string {
	return fmt.Sprintf("%.2f Gbps", bps/1e9)
}

func padGbps(bps float64) string {
	return fmt.Sprintf("%11s", fmtGbps(bps))
}

func meter(value, scale float64, w int) string {
	filled := 0
	if scale > 0 {
		filled = int(value / scale * float64(w))
	}
	filled = min(max(filled, 0), w)
	return strings.Repeat("█", filled) + strings.Repeat("░", w-filled)
}

func sparkline(vals []float64, w int) string {
	if len(vals) > w {
		vals = vals[len(vals)-w:]
	}
	var maxV float64
	for _, v := range vals {
		maxV = max(maxV, v)
	}
	if maxV == 0 {
		return strings.Repeat("▁", len(vals))
	}
	glyphs := []rune("▁▂▃▄▅▆▇█")
	var b strings.Builder
	for _, v := range vals {
		i := int(v / maxV * float64(len(glyphs)-1))
		b.WriteRune(glyphs[min(max(i, 0), len(glyphs)-1)])
	}
	return b.String()
}
