variable "cluster_name" {
  description = "Themed cluster name (Star Wars for k8s, e.g. 'luke'/'father'). Used as the Talos cluster name + the <clustername> segment of each node hostname."
  type        = string
}

# Node hostname convention: <product>-<provider>-<region>-<clustername>-<role>-<nodename>
#   e.g. yucca-int-aus-luke-k8s-<random>. provider/region are the 3-letter codes
#   from the region's region.hcl; <nodename> auto-derives from the shared inventory.
variable "product" {
  description = "Product segment of node hostnames."
  type        = string
  default     = "yucca"
}

variable "provider_code" {
  description = "3-letter provider segment of node hostnames (region.hcl provider_code, e.g. 'int' / 'htz')."
  type        = string
}

variable "region_code" {
  description = "3-letter region segment of node hostnames (region.hcl region_code, e.g. 'aus' / 'fsn')."
  type        = string
}

variable "role_in_hostname" {
  description = "Workload-role segment of node hostnames ('k8s' for Talos clusters). Distinct from the per-node control-plane/worker role."
  type        = string
  default     = "k8s"
}

variable "name_seed" {
  description = "Seed for the per-node random name pick (shared node-names inventory). Do NOT change once nodes are deployed (renames every auto-named node)."
  type        = string
  default     = "v1"
}

variable "talos_version" {
  description = "Talos Linux version to install (e.g., '1.13.3'). Sets machine config schema AND the install image tag (so the installed system is exactly this version, regardless of the maintenance-mode boot image)."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version Talos provisions. Null = Talos's bundled default for talos_version."
  type        = string
  default     = null
}

variable "talos_schematic_id" {
  description = "Image Factory schematic ID for a customized metal installer (system extensions). Null = stock siderolabs metal installer (no extensions)."
  type        = string
  default     = null
}

variable "install_disk" {
  description = "Talos install disk device path. WIPED on install. On the Dell nodes this is /dev/sda (the 240GB DELLBOSS) — the two 1.6TB NVMe drives are left untouched for data."
  type        = string
  default     = "/dev/sda"
}

variable "cluster_vip" {
  description = "Layer-2 control-plane Virtual IP, shared across CPs via Talos's etcd-backed election. Must be a free, un-leased address in the node subnet."
  type        = string
}

variable "cluster_endpoint" {
  description = "Kubernetes API endpoint URL baked into kubeconfig. Defaults to https://<cluster_vip>:6443."
  type        = string
  default     = null
}

variable "gateway" {
  description = "Default-route gateway for the node subnet (e.g., 10.10.10.1)."
  type        = string
}

variable "subnet_cidr" {
  description = "Node subnet in CIDR form (e.g., 10.10.10.0/24). Only the prefix length is used — node addresses come from nodes[].address."
  type        = string
}

variable "nameservers" {
  description = "DNS resolvers for the nodes."
  type        = list(string)
  default     = ["1.1.1.1", "8.8.8.8"]
}

variable "allow_scheduling_on_control_planes" {
  description = "Whether workloads may schedule on control-plane nodes. True for a compact (CP == worker) cluster; false for dedicated CPs."
  type        = bool
  default     = true
}

variable "bond" {
  description = "NIC bonding config applied to every node. interfaces are the physical links to enslave (e.g., [eno1np0, eno2np1]). mode 802.3ad requires the switch ports to be an LACP port-channel."
  type = object({
    name             = optional(string, "bond0")
    interfaces       = list(string)
    mode             = optional(string, "802.3ad")
    lacp_rate        = optional(string, "fast")
    xmit_hash_policy = optional(string, "layer3+4")
    miimon           = optional(number, 100)
  })
}

variable "nodes" {
  description = <<-EOT
    Bare-metal nodes — the single source of truth for cluster topology.
    `address` is the node's current maintenance-mode IP, which is ALSO
    pinned as the post-install static IP on bond0 (so addressing is stable
    and Terraform stays reachable across the install reboot).
  EOT
  type = list(object({
    name    = optional(string) # explicit hostname override; null = auto-pick from the shared inventory
    role    = optional(string, "control-plane")
    address = string
  }))

  validation {
    condition     = alltrue([for n in var.nodes : contains(["control-plane", "worker"], coalesce(n.role, "control-plane"))])
    error_message = "Each node.role must be 'control-plane' or 'worker'."
  }

  validation {
    condition     = length([for n in var.nodes : n if coalesce(n.role, "control-plane") == "control-plane"]) > 0
    error_message = "At least one control-plane node is required."
  }
}

variable "cni" {
  description = "CNI strategy. 'flannel' = Talos's bundled flannel (default). 'cilium' = set cluster.network.cni.name=none + open Cilium's overlay/health ports (Cilium is installed out of this module, e.g. via Helm in the stack). 'none' = disable the bundled CNI and open no overlay ports."
  type        = string
  default     = "flannel"

  validation {
    condition     = contains(["flannel", "cilium", "none"], var.cni)
    error_message = "cni must be 'flannel', 'cilium', or 'none'."
  }
}

variable "disable_kube_proxy" {
  description = "Set cluster.proxy.disabled=true so a CNI (e.g. Cilium) can run kube-proxy replacement. Talos KubePrism (localhost:7445) gives the CNI a stable API endpoint with no kube-proxy."
  type        = bool
  default     = false
}

variable "enable_hubble_firewall_ports" {
  description = "When cni=cilium, also open the Hubble peer port (4244/tcp) intra-cluster so the Hubble relay can reach each agent."
  type        = bool
  default     = false
}

variable "trust_tailscale" {
  description = "Allow the Tailscale CGNAT ranges (100.64.0.0/10, fd7a:115c:a1e0::/48) as sources on the operator-facing firewall rules (apid + apiserver), so a tailnet client reaching nodes via a source-preserving subnet router isn't dropped. Matches yucca-o11y."
  type        = bool
  default     = true
}

variable "health_skip_kubernetes_checks" {
  description = "Skip the Kubernetes-level checks (node Ready, pods) in the bootstrap health gate, verifying only Talos/etcd health. Required when the CNI is installed AFTER bootstrap (e.g. cni=cilium) — nodes stay NotReady until then, so requiring Ready here would deadlock."
  type        = bool
  default     = false
}

variable "enable_ingress_firewall" {
  description = "Apply Talos's host ingress firewall (NetworkDefaultActionConfig: block + per-service allow-lists). Sources are trusted_cidrs (defaults to the node subnet). NOTE: with this on, the host running `tf apply` must have a source IP inside the allow-list or apid (50000) is blocked and bootstrap/health will hang."
  type        = bool
  default     = true
}

variable "trusted_cidrs" {
  description = "Extra source CIDRs allowed by the ingress firewall, on top of subnet_cidr (e.g. an operator/jump-host subnet or VPN range). Applied to the talosctl/apiserver-facing rules."
  type        = list(string)
  default     = []
}

variable "pod_cidr" {
  description = "Pod network CIDR — allowed as a source on the kubelet rule so a pod scraping its own node (same-node, skips flannel masquerade) isn't dropped. Talos's flannel default is 10.244.0.0/16."
  type        = string
  default     = "10.244.0.0/16"
}

variable "config_patches" {
  description = "Extra strategic-merge YAML patches applied to ALL machine configs (CP and worker)."
  type        = list(string)
  default     = []
}

variable "netbird_setup_key" {
  description = "NetBird setup key for the node-level siderolabs/netbird system extension. When non-empty, an ExtensionServiceConfig document is appended to every machine config so each node joins the NetBird overlay on boot. The schematic (talos_schematic_id) must include siderolabs/netbird and the node must be upgraded to that schematic for the extension to install. Empty = extension left unconfigured. Sensitive."
  type        = string
  sensitive   = true
  default     = ""
}
