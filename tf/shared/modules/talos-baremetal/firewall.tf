# Talos host ingress firewall (ported from yucca-o11y). Default block; rules
# re-open host-bound services to trusted sources. Governs HOST-network ports
# only — ClusterIP/pod traffic rides the CNI overlay. Split by role so adding
# workers later Just Works.
# ⚠️ The `tf apply` host MUST be in local.operator_allow — apid (50000) is how
# the provider bootstraps/health-checks; otherwise those steps hang.

locals {
  # Tailscale CGNAT ranges — so a source-preserving subnet-router client isn't dropped.
  tailscale_cidrs = ["100.64.0.0/10", "fd7a:115c:a1e0::/48"]

  # Intra-cluster trust (node-to-node + declared operator subnets).
  firewall_allow = concat([var.subnet_cidr], var.trusted_cidrs)

  # Operator entrypoints (talosctl + apiserver) additionally trust Tailscale.
  operator_allow = concat(local.firewall_allow, var.trust_tailscale ? local.tailscale_cidrs : [])

  # kubelet also trusts the pod CIDR (same-node pod→kubelet scrape skips masquerade).
  kubelet_allow = concat(local.firewall_allow, [var.pod_cidr])

  # CNI overlay + health ports, selected by var.cni.
  overlay_firewall_patches = (
    var.cni == "flannel" ? [
      yamlencode({
        apiVersion   = "v1alpha1"
        kind         = "NetworkRuleConfig"
        name         = "flannel-vxlan"
        portSelector = { ports = [4789], protocol = "udp" }
        ingress      = [for c in local.firewall_allow : { subnet = c }]
      }),
      ] : var.cni == "cilium" ? concat([
        # Cilium VXLAN overlay (default tunnel datapath).
        yamlencode({
          apiVersion   = "v1alpha1"
          kind         = "NetworkRuleConfig"
          name         = "cilium-vxlan"
          portSelector = { ports = [8472], protocol = "udp" }
          ingress      = [for c in local.firewall_allow : { subnet = c }]
        }),
        # cilium-health TCP probes (ICMP not opened — TCP health is authoritative).
        yamlencode({
          apiVersion   = "v1alpha1"
          kind         = "NetworkRuleConfig"
          name         = "cilium-health"
          portSelector = { ports = [4240], protocol = "tcp" }
          ingress      = [for c in local.firewall_allow : { subnet = c }]
        }),
        ], var.enable_hubble_firewall_ports ? [
        # Hubble peer — the relay connects to each agent here.
        yamlencode({
          apiVersion   = "v1alpha1"
          kind         = "NetworkRuleConfig"
          name         = "hubble-peer"
          portSelector = { ports = [4244], protocol = "tcp" }
          ingress      = [for c in local.kubelet_allow : { subnet = c }]
        }),
    ] : []) : []
  )

  # Applied to every node.
  common_firewall_patches = var.enable_ingress_firewall ? concat([
    yamlencode({
      apiVersion = "v1alpha1"
      kind       = "NetworkDefaultActionConfig"
      ingress    = "block"
    }),
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "apid"
      portSelector = { ports = [50000], protocol = "tcp" }
      ingress      = [for c in local.operator_allow : { subnet = c }]
    }),
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "kubelet"
      portSelector = { ports = [10250], protocol = "tcp" }
      ingress      = [for c in local.kubelet_allow : { subnet = c }]
    }),
  ], local.overlay_firewall_patches) : []

  # Control-plane-only services.
  cp_firewall_patches = var.enable_ingress_firewall ? [
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "trustd"
      portSelector = { ports = [50001], protocol = "tcp" }
      ingress      = [for c in local.firewall_allow : { subnet = c }]
    }),
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "kube-apiserver"
      portSelector = { ports = [6443], protocol = "tcp" }
      ingress      = [for c in local.operator_allow : { subnet = c }]
    }),
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "etcd"
      portSelector = { ports = ["2379-2380"], protocol = "tcp" }
      # etcd is intra-cluster only — never the operator/Tailscale ranges.
      ingress = [for c in [var.subnet_cidr] : { subnet = c }]
    }),
  ] : []
}
