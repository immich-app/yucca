package discovery

import (
	"reflect"
	"testing"

	"yuctl/state"
)

func TestStackFromKey(t *testing.T) {
	tests := []struct {
		key  string
		want Stack
		ok   bool
	}{
		{
			key: "yucca/staging/austin/ceph/terraform.tfstate",
			want: Stack{Partition: "staging", Region: "austin", Stack: "ceph",
				Key: "yucca/staging/austin/ceph/terraform.tfstate"},
			ok: true,
		},
		{
			key: "yucca/prod/htz-fsn1/netbird/terraform.tfstate",
			want: Stack{Partition: "prod", Region: "htz-fsn1", Stack: "netbird",
				Key: "yucca/prod/htz-fsn1/netbird/terraform.tfstate"},
			ok: true,
		},
		{
			// nested sub-stack: stack keeps the joined tail
			key: "yucca/prod/htz-fsn1/fabric/sub/terraform.tfstate",
			want: Stack{Partition: "prod", Region: "htz-fsn1", Stack: "fabric/sub",
				Key: "yucca/prod/htz-fsn1/fabric/sub/terraform.tfstate"},
			ok: true,
		},
		{key: "yucca/staging/terraform.tfstate", ok: false}, // too shallow
	}
	for _, tc := range tests {
		got, ok := stackFromKey(tc.key)
		if ok != tc.ok {
			t.Errorf("stackFromKey(%q) ok = %v, want %v", tc.key, ok, tc.ok)
			continue
		}
		if ok && !reflect.DeepEqual(got, tc.want) {
			t.Errorf("stackFromKey(%q) = %+v, want %+v", tc.key, got, tc.want)
		}
	}
}

func TestStackFromSegments_Key(t *testing.T) {
	got := stackFromSegments([]string{"staging", "austin", "talos"})
	if got.Key != "yucca/staging/austin/talos/terraform.tfstate" {
		t.Errorf("key = %q", got.Key)
	}
}

func TestTopologyQueries(t *testing.T) {
	topo := &Topology{Stacks: []ResolvedStack{
		{Stack: Stack{Partition: "staging", Region: "austin", Stack: "talos"},
			Discovery: state.Discovery{Partition: "staging", Region: "austin", Role: "primary",
				Kubernetes: &state.Kubernetes{ClusterName: "yucca_staging_austin"}}},
		{Stack: Stack{Partition: "staging", Region: "austin", Stack: "ceph"},
			Discovery: state.Discovery{Partition: "staging", Region: "austin",
				CephClusters: map[string]state.CephCluster{"sietch": {ClusterName: "sietch"}}}},
		{Stack: Stack{Partition: "staging", Region: "global", Stack: "dns"},
			Discovery: state.Discovery{Partition: "staging", Region: "global"}},
	}}

	if !topo.HasRegion("staging", "austin") {
		t.Error("HasRegion(staging,austin) = false")
	}
	if topo.HasRegion("prod", "htz-fsn1") {
		t.Error("HasRegion(prod,htz-fsn1) = true, want false")
	}
	// global region excluded from Regions()
	regions := topo.Regions()
	if len(regions) != 1 || regions[0] != "staging@austin" {
		t.Errorf("Regions() = %v", regions)
	}
	if k := topo.Kubernetes("staging", "austin"); k == nil || k.ClusterName != "yucca_staging_austin" {
		t.Errorf("Kubernetes() = %+v", k)
	}
	if cc := topo.CephClusters("staging", "austin"); len(cc) != 1 || cc["sietch"].ClusterName != "sietch" {
		t.Errorf("CephClusters() = %+v", cc)
	}
	if p := topo.PrimaryRegion("staging"); p != "austin" {
		t.Errorf("PrimaryRegion(staging) = %q, want austin", p)
	}
}
