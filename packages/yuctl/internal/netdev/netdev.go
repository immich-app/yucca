// Package netdev parses /proc/net/dev snapshots — shared by the warp status
// sampler and bench-do agent/orchestrator so virtual-interface filtering stays
// in one place.
package netdev

import (
	"strconv"
	"strings"
)

type Counters struct{ RX, TX uint64 }

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
