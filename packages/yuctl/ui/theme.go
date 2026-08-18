package ui

import "github.com/charmbracelet/lipgloss"

var (
	accent = lipgloss.AdaptiveColor{Light: "#6C50FF", Dark: "#9D7CFF"}
	good   = lipgloss.AdaptiveColor{Light: "#12A150", Dark: "#2ECC71"}
	bad    = lipgloss.AdaptiveColor{Light: "#D0021B", Dark: "#FF5F56"}
	warn   = lipgloss.AdaptiveColor{Light: "#B8860B", Dark: "#F5C542"}
	muted  = lipgloss.AdaptiveColor{Light: "244", Dark: "241"}
	tx     = lipgloss.AdaptiveColor{Light: "#0087AF", Dark: "#33D1E0"}
	rx     = lipgloss.AdaptiveColor{Light: "#AF5F00", Dark: "#F5A623"}
)

// The dashboard styles shared by every styled view (warp, fleet-bench).
var (
	Badge = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FFFFFF")).Background(accent).Padding(0, 1)
	Title = lipgloss.NewStyle().Bold(true)
	Muted = lipgloss.NewStyle().Foreground(muted)
	OK    = lipgloss.NewStyle().Foreground(good)
	Bad   = lipgloss.NewStyle().Bold(true).Foreground(bad)
	Warn  = lipgloss.NewStyle().Foreground(warn)
	TX    = lipgloss.NewStyle().Foreground(tx)
	RX    = lipgloss.NewStyle().Foreground(rx)
	Total = lipgloss.NewStyle().Bold(true).Foreground(accent)
	Frame = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(accent).Padding(0, 1)
)
