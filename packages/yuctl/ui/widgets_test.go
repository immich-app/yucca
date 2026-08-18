package ui

import (
	"strings"
	"testing"
)

func TestSparklineAndMeter(t *testing.T) {
	if got := Sparkline([]float64{0, 1, 2, 4}, 10); len([]rune(got)) != 4 {
		t.Errorf("sparkline length: %q", got)
	}
	if got := Meter(50, 100, 10); !strings.HasPrefix(got, "█████░") {
		t.Errorf("meter: %q", got)
	}
	if got := Meter(0, 0, 4); got != "░░░░" {
		t.Errorf("empty meter: %q", got)
	}
}
