// Package ui is fubar's presentation layer: lipgloss styles, the progress
// line, and small render helpers. Honors NO_COLOR (via termenv) and stays out
// of the way entirely in --json mode.
package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	Title   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.AdaptiveColor{Light: "#5A56E0", Dark: "#7D79F6"})
	Subtle  = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#6b7280", Dark: "#9ca3af"})
	Good    = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#059669", Dark: "#34d399"})
	Bad     = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#dc2626", Dark: "#f87171"}).Bold(true)
	Warn    = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#d97706", Dark: "#fbbf24"})
	Accent  = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#0891b2", Dark: "#22d3ee"})
	CodeBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.AdaptiveColor{Light: "#5A56E0", Dark: "#7D79F6"}).
		Padding(0, 3).
		Bold(true)
)

// Bytes renders a human byte count.
func Bytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for n2 := n / unit; n2 >= unit; n2 /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(n)/float64(div), "KMGTPE"[exp])
}

// ProgressBar renders a fixed-width progress bar for percent in [0, 1].
func ProgressBar(percent float64, width int) string {
	if percent < 0 {
		percent = 0
	}
	if percent > 1 {
		percent = 1
	}
	filled := int(percent * float64(width))
	bar := Good.Render(strings.Repeat("█", filled)) + Subtle.Render(strings.Repeat("░", width-filled))
	return fmt.Sprintf("%s %5.1f%%", bar, percent*100)
}

// ClearLine erases the current terminal line (progress redraw).
const ClearLine = "\r\x1b[2K"
