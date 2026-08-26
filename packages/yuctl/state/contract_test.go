package state

import "testing"

// A realistic ceph-stack terraform.tfstate slice: the discovery output nested
// under outputs.discovery.value, with secrets as op:// refs.
const cephState = `{
  "version": 4,
  "outputs": {
    "discovery": {
      "value": {
        "schema_version": 1,
        "partition": "staging",
        "region": "austin",
        "slug": "staging-austin",
        "role": "primary",
        "stack": "ceph",
        "stack_type": "ceph",
        "region_meta": {"site_id": null, "datacenter": "austin", "provider_code": "aus", "domain": "staging.example.com"},
        "ceph_clusters": {
          "sietch": {
            "cluster_name": "sietch",
            "fqdn": "sietch.staging.austin.int",
            "rgw_s3_endpoint": "https://s3.sietch.staging.austin.int",
            "health_cred_ref": "op://yucca_tf_staging/SIETCH_HEALTH/password",
            "s3_admin_cred_refs": {"access": "op://v/i/access", "secret": "op://v/i/secret"},
            "secret_item_titles": {"health": "SIETCH_HEALTH"},
            "bootstrap_host": "ceph-1.sietch"
          }
        }
      }
    },
    "kubeconfig": {"value": "REDACTED", "sensitive": true}
  }
}`

func TestParseDiscovery_Ceph(t *testing.T) {
	d, err := ParseDiscovery([]byte(cephState))
	if err != nil {
		t.Fatalf("ParseDiscovery: %v", err)
	}
	if d == nil {
		t.Fatal("expected discovery, got nil")
	}
	if d.Partition != "staging" || d.Region != "austin" || d.Slug != "staging-austin" {
		t.Errorf("envelope mismatch: %+v", d)
	}
	if d.Role != "primary" || d.StackType != "ceph" {
		t.Errorf("role/stack_type mismatch: role=%q stack_type=%q", d.Role, d.StackType)
	}
	if d.RegionMeta.Domain != "staging.example.com" {
		t.Errorf("region_meta.domain = %q", d.RegionMeta.Domain)
	}
	cc, ok := d.CephClusters["sietch"]
	if !ok {
		t.Fatal("missing sietch ceph cluster")
	}
	if cc.RGWS3Endpoint != "https://s3.sietch.staging.austin.int" {
		t.Errorf("rgw_s3_endpoint = %q", cc.RGWS3Endpoint)
	}
	if cc.HealthCredRef != "op://yucca_tf_staging/SIETCH_HEALTH/password" {
		t.Errorf("health_cred_ref = %q", cc.HealthCredRef)
	}
	if cc.S3AdminCredRefs["access"] != "op://v/i/access" {
		t.Errorf("s3_admin_cred_refs = %v", cc.S3AdminCredRefs)
	}
}

func TestParseDiscovery_NoOutput(t *testing.T) {
	// A pre-contract stack: no discovery output. Should return (nil, nil).
	d, err := ParseDiscovery([]byte(`{"version":4,"outputs":{}}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d != nil {
		t.Errorf("expected nil discovery, got %+v", d)
	}
}

func TestParseDiscovery_NullValue(t *testing.T) {
	d, err := ParseDiscovery([]byte(`{"outputs":{"discovery":{"value":null}}}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d != nil {
		t.Errorf("expected nil discovery for null value, got %+v", d)
	}
}

func TestParseDiscovery_K8s(t *testing.T) {
	const k8sState = `{"outputs":{"discovery":{"value":{
		"partition":"staging","region":"austin","stack_type":"region-k8s","role":"primary",
		"kubernetes":{"cluster_name":"yucca_staging_austin","api_endpoint":"https://10.0.0.1:6443",
		"admin_api_host":"admin.staging.example.com",
		"cp_node_ips":["10.0.0.1","10.0.0.2"],"talosconfig_ref":"op://v/talos/cfg","kubeconfig_ref":"op://v/kube/cfg"}}}}}`
	d, err := ParseDiscovery([]byte(k8sState))
	if err != nil {
		t.Fatalf("ParseDiscovery: %v", err)
	}
	if d.Kubernetes == nil {
		t.Fatal("expected kubernetes payload")
	}
	if len(d.Kubernetes.CPNodeIPs) != 2 || d.Kubernetes.TalosconfigRef != "op://v/talos/cfg" {
		t.Errorf("kubernetes payload mismatch: %+v", d.Kubernetes)
	}
	if d.Kubernetes.AdminAPIHost != "admin.staging.example.com" {
		t.Errorf("admin_api_host = %q", d.Kubernetes.AdminAPIHost)
	}
}
