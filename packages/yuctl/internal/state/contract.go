// Package state is the Go view of the Terraform `discovery` output contract
// (Workstream 1.5), parsed from raw terraform.tfstate. Each stack emits one
// non-sensitive top-level `discovery` output: common envelope + stack-typed
// payload; secrets are ALWAYS `op://` refs (resolved via the op package), never literal.
package state

import (
	"encoding/json"
	"fmt"
)

// Discovery is the decoded `.outputs.discovery.value` envelope plus the union
// of stack-typed payloads; exactly one group is populated per stack (talos →
// Kubernetes, ceph → CephClusters, …), the rest stay nil/empty.
type Discovery struct {
	// Envelope — present on every stack.
	SchemaVersion int        `json:"schema_version"`
	Partition     string     `json:"partition"`
	Region        string     `json:"region"`
	Slug          string     `json:"slug"`
	Role          string     `json:"role"` // "primary" | "secondary" | "" (null for global)
	Stack         string     `json:"stack"`
	StackType     string     `json:"stack_type"`
	RegionMeta    RegionMeta `json:"region_meta"`

	// Payloads — populated per stack_type.
	Kubernetes   *Kubernetes            `json:"kubernetes,omitempty"`
	CephClusters map[string]CephCluster `json:"ceph_clusters,omitempty"`
	DNS          *DNS                   `json:"dns,omitempty"`
	Netbird      *Netbird               `json:"netbird,omitempty"`
	Fabric       *Fabric                `json:"fabric,omitempty"`
}

// RegionMeta is the per-region metadata merged in from region.hcl.
type RegionMeta struct {
	SiteID       *int   `json:"site_id"` // numeric fabric site id; null for non-fabric sites (austin)
	Datacenter   string `json:"datacenter"`
	ProviderCode string `json:"provider_code"`
	Domain       string `json:"domain"`
}

// Kubernetes is the region-k8s (talos) payload. A region has exactly one.
type Kubernetes struct {
	ClusterName      string   `json:"cluster_name"`
	APIEndpoint      string   `json:"api_endpoint"`
	OperatorEndpoint string   `json:"operator_endpoint"`
	CPNodeIPs        []string `json:"cp_node_ips"`
	KubeconfigRef    string   `json:"kubeconfig_ref"`  // op:// reference
	TalosconfigRef   string   `json:"talosconfig_ref"` // op:// reference
}

// CephCluster is one entry of the ceph payload's ceph_clusters map. A region may
// have one-or-more, keyed by friendly name (e.g. "sietch").
type CephCluster struct {
	ClusterName      string            `json:"cluster_name"`
	FQDN             string            `json:"fqdn"`
	RGWS3Endpoint    string            `json:"rgw_s3_endpoint"`
	HealthCredRef    string            `json:"health_cred_ref"`    // op:// reference
	S3AdminCredRefs  map[string]string `json:"s3_admin_cred_refs"` // op:// references
	SecretItemTitles map[string]string `json:"secret_item_titles"` // purpose → 1P item title
	BootstrapHost    string            `json:"bootstrap_host"`
}

// DNS is the dns stack payload.
type DNS struct {
	Provider    string   `json:"provider"`
	Zone        string   `json:"zone"`
	RecordFQDNs []string `json:"record_fqdns"`
	APITokenRef string   `json:"api_token_ref"` // op:// reference
}

// Netbird is the netbird / global stack payload. All maps are keyed by the
// friendly resource name (e.g. group "ceph", network "HTZ-FSN1").
type Netbird struct {
	NamePrefix         string            `json:"name_prefix"`
	Vault              string            `json:"vault"`
	GroupIDs           map[string]string `json:"group_ids"`
	PolicyIDs          map[string]string `json:"policy_ids"`
	NetworkIDs         map[string]string `json:"network_ids"`
	SetupKeyItemTitles map[string]string `json:"setup_key_item_titles"`
}

// ClusterCIDR is one fabric cluster's public/private CIDR pair.
type ClusterCIDR struct {
	Public  string `json:"public"`
	Private string `json:"private"`
}

// MgmtHost is one management host of a fabric site — the ssh targets for
// site-local tooling (yuctl tools bench).
type MgmtHost struct {
	Name     string `json:"name"`
	PublicIP string `json:"public_ip"`
}

// Fabric is the fabric stack payload.
type Fabric struct {
	SiteID       *int                   `json:"site_id"`
	KubeCIDR     string                 `json:"kube_cidr"`
	MgmtCIDR     string                 `json:"mgmt_cidr"`
	ClusterCIDRs map[string]ClusterCIDR `json:"cluster_cidrs"` // keyed by ceph cluster slug (e.g. "cls1")
	MgmtHosts    []MgmtHost             `json:"mgmt_hosts,omitempty"`
}

// tfState: minimal slice of terraform.tfstate — just `outputs.discovery.value`;
// the (large, sensitive) rest is deliberately ignored.
type tfState struct {
	Outputs struct {
		Discovery struct {
			Value json.RawMessage `json:"value"`
		} `json:"discovery"`
	} `json:"outputs"`
}

// ParseDiscovery decodes `.outputs.discovery.value` from raw tfstate. Returns
// (nil, nil) when there is no `discovery` output (stack predates the contract)
// so callers skip rather than error.
func ParseDiscovery(raw []byte) (*Discovery, error) {
	var st tfState
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("parse tfstate: %w", err)
	}
	if len(st.Outputs.Discovery.Value) == 0 || string(st.Outputs.Discovery.Value) == "null" {
		return nil, nil
	}
	var d Discovery
	if err := json.Unmarshal(st.Outputs.Discovery.Value, &d); err != nil {
		return nil, fmt.Errorf("parse discovery output: %w", err)
	}
	return &d, nil
}
