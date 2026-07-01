# Talos host ingress firewall (default-deny + per-service allow-lists). Governs
# HOST-network ports only; pod/ClusterIP traffic rides Cilium.
#
# Trust planes for this hybrid cluster:
#   kube_cidr        10.40.10.0/24  workers' fabric IPs (east-west, BGP)
#   kube_cp_cidr     10.40.11.0/24  CP private IPs + the API LB (etcd, LB health-checks)
#   netbird_node_cidr 100.64.0.0/10 the NetBird mesh (apiserver↔kubelet, node control)
#   trusted_cidrs    operator/CI source ranges
#
# ⚠️ The TF runner dials the CP PUBLIC IPs for bootstrap (apid 50000) and the
# helm/kubernetes providers (apiserver 6443). Its source IP MUST be in
# trusted_cidrs (e.g. the CI runner's egress / NetBird range) or those steps hang.
locals {
  firewall_allow = concat([local.kube_cidr, local.kube_cp_cidr, local.c.netbird_node_cidr], var.trusted_cidrs)
  operator_allow = local.firewall_allow
  kubelet_allow  = concat(local.firewall_allow, [local.pod_cidr])

  common_firewall_patches = concat([
    yamlencode({ apiVersion = "v1alpha1", kind = "NetworkDefaultActionConfig", ingress = "block" }),
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
    # Cilium health probes.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "cilium-health"
      portSelector = { ports = [4240], protocol = "tcp" }
      ingress      = [for c in local.firewall_allow : { subnet = c }]
    }),
    # Cilium geneve overlay (tunnel routing): pod↔pod is encapsulated node-to-node
    # (UDP 6081). Required across BOTH L2 domains — worker↔worker over the fabric and
    # CP↔worker over the mesh — or pod-to-pod traffic is silently dropped.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "cilium-geneve"
      portSelector = { ports = [6081], protocol = "udp" }
      ingress      = [for c in local.firewall_allow : { subnet = c }]
    }),
    ], local.c.hubble ? [
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "hubble-peer"
      portSelector = { ports = [4244], protocol = "tcp" }
      ingress      = [for c in local.kubelet_allow : { subnet = c }]
    }),
  ] : [])

  cp_firewall_patches = [
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
      # etcd is CP↔CP on the kube-cp subnet only — never the mesh/operators.
      ingress = [{ subnet = local.kube_cp_cidr }]
    }),
  ]
}
