// Package state defines the Go view of the Terraform "discovery" output
// contract (Workstream 1.5) and parses it out of raw terraform.tfstate objects.
//
// Every stack emits a single non-sensitive top-level output named `discovery`
// with a common envelope and a stack-typed payload. Secrets are ALWAYS `op://`
// reference strings (resolved later via the op package), never literal values.
package state

import (
	"encoding/json"
	"fmt"
)

// Discovery is the decoded `.outputs.discovery.value` envelope plus the union of
// every stack-typed payload. Exactly one payload group is populated per stack
// (talos → Kubernetes, ceph → CephClusters, etc.); the rest stay nil/empty.
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
	SiteID       string `json:"site_id"`
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
	SecretItemTitles []string          `json:"secret_item_titles"`
	BootstrapHost    string            `json:"bootstrap_host"`
}

// DNS is the dns stack payload.
type DNS struct {
	Provider    string   `json:"provider"`
	Zone        string   `json:"zone"`
	RecordFQDNs []string `json:"record_fqdns"`
	APITokenRef string   `json:"api_token_ref"` // op:// reference
}

// Netbird is the netbird / global stack payload.
type Netbird struct {
	NamePrefix         string   `json:"name_prefix"`
	Vault              string   `json:"vault"`
	GroupIDs           []string `json:"group_ids"`
	PolicyIDs          []string `json:"policy_ids"`
	NetworkIDs         []string `json:"network_ids"`
	SetupKeyItemTitles []string `json:"setup_key_item_titles"`
}

// Fabric is the fabric stack payload.
type Fabric struct {
	SiteID       string   `json:"site_id"`
	KubeCIDR     string   `json:"kube_cidr"`
	MgmtCIDR     string   `json:"mgmt_cidr"`
	ClusterCIDRs []string `json:"cluster_cidrs"`
}

// tfState is the minimal slice of a terraform.tfstate JSON document we care
// about: the `outputs.discovery.value` envelope. We deliberately ignore the
// rest of the (potentially large, sensitive) state body.
type tfState struct {
	Outputs struct {
		Discovery struct {
			Value json.RawMessage `json:"value"`
		} `json:"discovery"`
	} `json:"outputs"`
}

// ParseDiscovery extracts and decodes `.outputs.discovery.value` from a raw
// terraform.tfstate document. It returns (nil, nil) when the state has no
// `discovery` output (e.g. a stack that predates the contract), so callers can
// skip such stacks rather than treat them as errors.
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
