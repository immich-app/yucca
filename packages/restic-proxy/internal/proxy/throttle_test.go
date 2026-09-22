package proxy

import (
	"bytes"
	"io"
	"testing"
	"time"
)

func at(t *testing.T, clock string) time.Time {
	t.Helper()
	parsed, err := time.Parse("15:04", clock)
	if err != nil {
		t.Fatalf("parse %s: %v", clock, err)
	}
	return parsed
}

func TestNewThrottle_RejectsUnparseableQuietHours(t *testing.T) {
	if _, err := newThrottle(1024, "ten-six"); err == nil {
		t.Error("expected unparseable quiet hours to be rejected")
	}
}

func TestNewThrottle_BurstCoversAWholeCopyBuffer(t *testing.T) {
	limit, err := newThrottle(1024, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if limit.limiter.Burst() < copyBufferSize {
		t.Errorf("expected a burst of at least %d, got %d", copyBufferSize, limit.limiter.Burst())
	}
}

func TestThrottle_AppliesOnlyOutsideTheQuietHours(t *testing.T) {
	cases := []struct {
		name       string
		quietHours string
		clock      string
		want       bool
	}{
		{name: "no window throttles all day", quietHours: "", clock: "13:00", want: true},
		{name: "a window covering the whole day never throttles", quietHours: "06:00-06:00", clock: "13:00", want: false},
		{name: "inside the quiet hours", quietHours: "22:00-06:00", clock: "23:30", want: false},
		{name: "outside the quiet hours", quietHours: "22:00-06:00", clock: "12:00", want: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			limit, err := newThrottle(1024, tc.quietHours)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if limit.active(at(t, tc.clock)) != tc.want {
				t.Errorf("expected active %v at %s", tc.want, tc.clock)
			}
		})
	}
}

func TestPace_LeavesTheBodyAloneWithoutALimit(t *testing.T) {
	body := io.NopCloser(bytes.NewReader([]byte("payload")))

	if pace(t.Context(), body, throttled(t, 0, "")) != body {
		t.Error("expected an unthrottled body to be passed through untouched")
	}
}

func TestPace_LeavesTheBodyAloneInsideTheQuietHours(t *testing.T) {
	body := io.NopCloser(bytes.NewReader([]byte("payload")))

	if pace(t.Context(), body, throttled(t, 1024, "00:00-00:00")) != body {
		t.Error("expected a body inside the quiet hours to be passed through untouched")
	}
}
