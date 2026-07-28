package netdev

import "testing"

const sample = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  1000     10    0    0    0     0          0         0     1000     10    0    0    0     0       0          0
 bond0: 500000   100    0    0    0     0          0         0   900000    200    0    0    0     0       0          0
`

func TestParse(t *testing.T) {
	got := Parse(sample)
	b, ok := got["bond0"]
	if !ok || b.RX != 500000 || b.TX != 900000 {
		t.Fatalf("bond0 = %+v, ok=%v", b, ok)
	}
	if _, ok := got["lo"]; !ok {
		t.Fatal("lo missing (filtering happens later, parsing should keep it)")
	}
}

func TestVirtual(t *testing.T) {
	for _, virt := range []string{"lo", "cilium_host", "lxc123", "veth0", "wt0", "nb-wt0"} {
		if !Virtual(virt) {
			t.Errorf("%s should be virtual", virt)
		}
	}
	for _, phys := range []string{"bond0", "enp193s0f0", "eth0", "ens3"} {
		if Virtual(phys) {
			t.Errorf("%s should be physical", phys)
		}
	}
}

func TestPhysicalTotals(t *testing.T) {
	tot := PhysicalTotals(Parse(sample))
	if tot.RX != 500000 || tot.TX != 900000 {
		t.Fatalf("totals = %+v, want lo excluded", tot)
	}
}
