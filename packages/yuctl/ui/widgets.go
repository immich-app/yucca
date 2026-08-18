package ui

import (
	"fmt"
	"strings"
)

// Meter renders a horizontal bar of width w, filled to value/scale.
func Meter(value, scale float64, w int) string {
	filled := 0
	if scale > 0 {
		filled = int(value / scale * float64(w))
	}
	filled = min(max(filled, 0), w)
	return strings.Repeat("█", filled) + strings.Repeat("░", w-filled)
}

// Sparkline renders the last len(vals) samples with block glyphs, scaled to
// the window maximum, downsampled to at most w points.
func Sparkline(vals []float64, w int) string {
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

func FmtGbps(bps float64) string {
	return fmt.Sprintf("%.2f Gbps", bps/1e9)
}

func PadGbps(bps float64) string {
	return fmt.Sprintf("%11s", FmtGbps(bps))
}

// ErrCell renders a right-aligned error count of the given width, alarming
// when non-zero.
func ErrCell(n, width int) string {
	s := fmt.Sprintf("%*d", width, n)
	if n > 0 {
		return Bad.Render(s)
	}
	return Muted.Render(s)
}

// Truncate cuts s to at most n bytes, appending an ellipsis when cut.
func Truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
