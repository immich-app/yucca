package proxy

import (
	"fmt"
	"strconv"
	"strings"
)

type window struct {
	start int
	end   int
}

func parseWindow(quietHours string) (*window, error) {
	if quietHours == "" {
		return nil, nil
	}

	start, end, ok := strings.Cut(quietHours, "-")
	if !ok {
		return nil, fmt.Errorf("quiet hours %q are not a HH:MM-HH:MM range", quietHours)
	}

	from, err := parseMinuteOfDay(start)
	if err != nil {
		return nil, err
	}

	until, err := parseMinuteOfDay(end)
	if err != nil {
		return nil, err
	}

	return &window{start: from, end: until}, nil
}

func parseMinuteOfDay(clock string) (int, error) {
	hours, minutes, ok := strings.Cut(clock, ":")
	if !ok {
		return 0, fmt.Errorf("time %q is not HH:MM", clock)
	}

	hour, err := strconv.Atoi(hours)
	if err != nil || hour < 0 || hour > 23 {
		return 0, fmt.Errorf("hour %q is out of range", hours)
	}

	minute, err := strconv.Atoi(minutes)
	if err != nil || minute < 0 || minute > 59 {
		return 0, fmt.Errorf("minute %q is out of range", minutes)
	}

	return hour*60 + minute, nil
}

func (quiet *window) contains(minuteOfDay int) bool {
	if quiet == nil {
		return false
	}

	if quiet.start == quiet.end {
		return true
	}

	if quiet.start < quiet.end {
		return minuteOfDay >= quiet.start && minuteOfDay < quiet.end
	}

	return minuteOfDay >= quiet.start || minuteOfDay < quiet.end
}
