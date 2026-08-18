package warp

import (
	"strings"
	"testing"
	"time"

	warpfleet "yuctl/fleet/warp"
)

func TestViewRender(t *testing.T) {
	v := &view{label: "prod@htz-fsn1 → spice · father"}
	r := &warpfleet.StatusReport{
		Config: map[string]string{
			"mode": "nonstop", "started_at": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
			"put_streams": "1002", "get_streams": "102",
			"put_obj_size": "16MiB", "get_obj_size": "16MiB",
			"rgw_endpoints": "47", "endpoint": "https://s3.example",
		},
		Pods: []warpfleet.PodStatus{
			{Name: "warp-runner-a", Node: "jeanne", PutProcs: 1, GetProcs: 1},
			{Name: "warp-runner-b", Node: "sheron", PutProcs: 0, GetProcs: 1, PutErrors: 3},
		},
		Nodes: []warpfleet.NodeThroughput{
			{Node: "jeanne", Iface: "bond0", TxBps: 49e9, RxBps: 31e9},
			{Node: "sheron", Iface: "bond0", TxBps: 50e9, RxBps: 35e9},
		},
	}
	v.history.Push(160e9)
	v.history.Push(165e9)
	out := v.render(r, time.Now(), 5, true)
	for _, want := range []string{"WARP", "nonstop", "jeanne", "bond0", "combined", "ctrl-c"} {
		if !strings.Contains(out, want) {
			t.Errorf("render missing %q:\n%s", want, out)
		}
	}

	empty := (&view{label: "x"}).render(&warpfleet.StatusReport{}, time.Now(), 5, false)
	if !strings.Contains(empty, "no runner pods deployed") {
		t.Errorf("empty render: %s", empty)
	}
}
