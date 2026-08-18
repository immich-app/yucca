// Package netdev parses /proc/net/dev counter snapshots. Shared by everything
// that measures NIC throughput from that file — the warp status sampler and
// the fleet-bench agent/orchestrator — so virtual-interface filtering stays in
// one place.
package netdev

import (
	"strconv"
	"strings"
)

// Counters is one interface's cumulative RX/TX byte counters.
type Counters struct{ RX, TX uint64 }

// Parse decodes the text of /proc/net/dev into per-interface counters.
func Parse(text string) map[string]Counters {
	res := map[string]Counters{}
	for line := range strings.SplitSeq(text, "\n") {
		name, rest, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		f := strings.Fields(rest)
		if len(f) < 9 {
			continue
		}
		rx, err1 := strconv.ParseUint(f[0], 10, 64)
		tx, err2 := strconv.ParseUint(f[8], 10, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		res[strings.TrimSpace(name)] = Counters{RX: rx, TX: tx}
	}
	return res
}

// Virtual reports whether an interface name is a virtual device (CNI veths,
// tunnels, overlays, loopback) that should be excluded from host-NIC totals.
func Virtual(name string) bool {
	for _, p := range []string{"lo", "veth", "lxc", "cilium", "cni", "flannel", "kube", "dummy", "tunl", "docker", "vxlan", "geneve", "wg", "wt", "nb"} {
		if name == p || strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// PhysicalTotals sums the counters of every non-virtual interface.
func PhysicalTotals(m map[string]Counters) Counters {
	var t Counters
	for name, c := range m {
		if Virtual(name) {
			continue
		}
		t.RX += c.RX
		t.TX += c.TX
	}
	return t
}
