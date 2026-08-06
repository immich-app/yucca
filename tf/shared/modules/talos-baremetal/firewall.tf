# Talos host ingress firewall — ported from yucca-o11y, slimmed for a flat
# private LAN (no public NIC, no NodePort ingress controller yet).
#
# Default action is `block`; each rule re-opens one host-bound service to
# trusted sources only. This governs HOST-network ports only — ClusterIP and
# pod-to-pod traffic ride the CNI overlay (opened below) and aren't subject to
# these rules.
#
# Rule split by role: apid/kubelet/overlay run everywhere; trustd/apiserver/etcd
# are control-plane services. On this compact cluster every node is a CP, but
# keeping the split correct means adding workers later Just Works.
#
# ⚠️ The host running `tf apply` MUST have a source IP within local.operator_allow
# (the node subnet + trusted_cidrs + Tailscale ranges). apid (50000) is how the
# provider bootstraps and health-checks; if the operator's source IP isn't
# allowed, those steps hang.

locals {
  # Tailscale CGNAT ranges — allowed on operator-facing rules so a tailnet
  # client reaching nodes via a source-preserving subnet router isn't dropped.
  tailscale_cidrs = ["100.64.0.0/10", "fd7a:115c:a1e0::/48"]

  # Intra-cluster trust (node-to-node + declared operator subnets).
  firewall_allow = concat([var.subnet_cidr], var.trusted_cidrs)

  # Operator entrypoints (talosctl + apiserver) additionally trust Tailscale.
  operator_allow = concat(local.firewall_allow, var.trust_tailscale ? local.tailscale_cidrs : [])

  # kubelet additionally trusts the pod CIDR (same-node pod→kubelet scrape
  # skips the CNI masquerade and would otherwise be dropped).
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
        # cilium-health connectivity probes (TCP; ICMP probes are best-effort
        # and not opened — TCP health is authoritative).
        yamlencode({
          apiVersion   = "v1alpha1"
          kind         = "NetworkRuleConfig"
          name         = "cilium-health"
          portSelector = { ports = [4240], protocol = "tcp" }
          ingress      = [for c in local.firewall_allow : { subnet = c }]
        }),
        # Cilium agent/operator prometheus listeners (host network; enabled in
        # the cilium helm values) — scraped by the vmagent.
        yamlencode({
          apiVersion   = "v1alpha1"
          kind         = "NetworkRuleConfig"
          name         = "cilium-metrics"
          portSelector = { ports = [9962, 9963], protocol = "tcp" }
          ingress      = [for c in local.kubelet_allow : { subnet = c }]
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
        # Hubble per-agent metrics listener, scraped by the vmagent.
        yamlencode({
          apiVersion   = "v1alpha1"
          kind         = "NetworkRuleConfig"
          name         = "hubble-metrics"
          portSelector = { ports = [9965], protocol = "tcp" }
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
    # node-exporter (host network on every node), scraped by the vmagent.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "node-exporter"
      portSelector = { ports = [9100], protocol = "tcp" }
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
    # Control-plane metrics listeners (controller-manager, scheduler, etcd's
    # :2381 — see cp_cluster_config), scraped by the vmagent. Unlike etcd's
    # client ports these are read-only, so pod/cluster trust suffices.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "control-plane-metrics"
      portSelector = { ports = [10257, 10259, 2381], protocol = "tcp" }
      ingress      = [for c in local.kubelet_allow : { subnet = c }]
    }),
  ] : []
}
