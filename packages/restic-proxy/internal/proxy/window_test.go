package proxy

import "testing"

func TestParseWindow_RejectsUnparseableQuietHours(t *testing.T) {
	for _, quietHours := range []string{"22:00", "22:00-", "-06:00", "24:00-06:00", "22:60-06:00", "ten-six"} {
		if _, err := parseWindow(quietHours); err == nil {
			t.Errorf("expected %q to be rejected", quietHours)
		}
	}
}

func TestParseWindow_ReadsBothEndsAsMinutesOfDay(t *testing.T) {
	quiet, err := parseWindow("22:15-06:30")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if quiet.start != 22*60+15 {
		t.Errorf("expected a start of %d, got %d", 22*60+15, quiet.start)
	}
	if quiet.end != 6*60+30 {
		t.Errorf("expected an end of %d, got %d", 6*60+30, quiet.end)
	}
}

func TestWindow_Contains(t *testing.T) {
	cases := []struct {
		name       string
		quietHours string
		minute     int
		want       bool
	}{
		{name: "no window contains nothing", quietHours: "", minute: 13 * 60, want: false},
		{name: "matching ends cover the whole day", quietHours: "06:00-06:00", minute: 13 * 60, want: true},
		{name: "inside an overnight window", quietHours: "22:00-06:00", minute: 23*60 + 30, want: true},
		{name: "after midnight is still overnight", quietHours: "22:00-06:00", minute: 5*60 + 59, want: true},
		{name: "outside an overnight window", quietHours: "22:00-06:00", minute: 12 * 60, want: false},
		{name: "the end is exclusive", quietHours: "22:00-06:00", minute: 6 * 60, want: false},
		{name: "the start is inclusive", quietHours: "09:00-17:00", minute: 9 * 60, want: true},
		{name: "before a daytime window", quietHours: "09:00-17:00", minute: 8*60 + 59, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			quiet, err := parseWindow(tc.quietHours)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if quiet.contains(tc.minute) != tc.want {
				t.Errorf("expected contains %v for minute %d", tc.want, tc.minute)
			}
		})
	}
}
