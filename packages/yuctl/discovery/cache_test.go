package discovery

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/rs/zerolog"

	"yuctl/state"
)

func testTopology() *Topology {
	return &Topology{Stacks: []ResolvedStack{
		{Stack: Stack{Partition: "staging", Region: "austin", Stack: "talos",
			Key: "yucca/staging/austin/talos/terraform.tfstate"},
			Discovery: state.Discovery{Partition: "staging", Region: "austin", Role: "primary",
				Kubernetes: &state.Kubernetes{ClusterName: "yucca_staging_austin",
					APIEndpoint: "https://kube.luke.austin.int.yucca.futo.network:6443"}}},
	}}
}

func TestCacheRoundTrip(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	logger := zerolog.Nop()

	if _, ok := LoadCachedTopology(logger); ok {
		t.Fatal("LoadCachedTopology hit on empty config dir")
	}

	want := testTopology()
	SaveCachedTopology(want, logger)
	got, ok := LoadCachedTopology(logger)
	if !ok {
		t.Fatal("LoadCachedTopology miss right after save")
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("cached topology = %+v, want %+v", got, want)
	}
}

func TestCacheExpiry(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	logger := zerolog.Nop()

	SaveCachedTopology(testTopology(), logger)

	// TTL 0 means "always expired" — a duration-string override of the 1h default.
	t.Setenv(cacheTTLEnvVar, "0s")
	if _, ok := LoadCachedTopology(logger); ok {
		t.Error("LoadCachedTopology hit with TTL 0")
	}

	t.Setenv(cacheTTLEnvVar, "1h")
	if _, ok := LoadCachedTopology(logger); !ok {
		t.Error("LoadCachedTopology miss with TTL 1h")
	}
}

func TestCacheCorruptIsMiss(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	logger := zerolog.Nop()

	p, err := cachePath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := LoadCachedTopology(logger); ok {
		t.Error("LoadCachedTopology hit on corrupt cache file")
	}
}
