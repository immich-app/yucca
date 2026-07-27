package cli

import (
	"strings"
	"testing"
	"time"

	"yuctl/internal/warp"
)

func TestWarpViewRender(t *testing.T) {
	v := &warpView{label: "prod@htz-fsn1 → spice · father"}
	r := &warp.StatusReport{
		Config: map[string]string{
			"mode": "nonstop", "started_at": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
			"put_streams": "1002", "get_streams": "102",
			"put_obj_size": "16MiB", "get_obj_size": "16MiB",
			"rgw_endpoints": "47", "endpoint": "https://s3.example",
		},
		Pods: []warp.PodStatus{
			{Name: "warp-runner-a", Node: "jeanne", PutProcs: 1, GetProcs: 1},
			{Name: "warp-runner-b", Node: "sheron", PutProcs: 0, GetProcs: 1, PutErrors: 3},
		},
		Nodes: []warp.NodeThroughput{
			{Node: "jeanne", Iface: "bond0", TxBps: 49e9, RxBps: 31e9},
			{Node: "sheron", Iface: "bond0", TxBps: 50e9, RxBps: 35e9},
		},
	}
	v.push(160e9)
	v.push(165e9)
	out := v.render(r, time.Now(), 5, true)
	for _, want := range []string{"WARP", "nonstop", "jeanne", "bond0", "combined", "ctrl-c"} {
		if !strings.Contains(out, want) {
			t.Errorf("render missing %q:\n%s", want, out)
		}
	}

	empty := (&warpView{label: "x"}).render(&warp.StatusReport{}, time.Now(), 5, false)
	if !strings.Contains(empty, "no runner pods deployed") {
		t.Errorf("empty render: %s", empty)
	}
}

func TestSparklineAndMeter(t *testing.T) {
	if got := sparkline([]float64{0, 1, 2, 4}, 10); len([]rune(got)) != 4 {
		t.Errorf("sparkline length: %q", got)
	}
	if got := meter(50, 100, 10); !strings.HasPrefix(got, "█████░") {
		t.Errorf("meter: %q", got)
	}
	if got := meter(0, 0, 4); got != "░░░░" {
		t.Errorf("empty meter: %q", got)
	}
}
