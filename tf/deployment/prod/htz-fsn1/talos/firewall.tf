# Talos host ingress firewall (default-deny). HOST-network ports only; pod/
# ClusterIP traffic rides Cilium. Trust planes: kube 10.40.10/24, kube-cp
# 10.40.11/24, NetBird 10.254/15, trusted_cidrs (operator/CI).
# ⚠️ The TF runner's source IP MUST be in trusted_cidrs (apid 50000 + apiserver
# 6443) or bootstrap/provider steps hang.
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
    # Geneve overlay (UDP 6081) — needed across BOTH L2 domains or pod↔pod is
    # silently dropped.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "cilium-geneve"
      portSelector = { ports = [6081], protocol = "udp" }
      ingress      = [for c in local.firewall_allow : { subnet = c }]
    }),
    # Mayastor: io-engine gRPC 10124 + csi-node gRPC 10199 (hostPort); NVMe-oF/TCP
    # 8420 target + 4421 nexus node-to-node.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "mayastor-grpc"
      portSelector = { ports = [10124, 10199], protocol = "tcp" }
      ingress      = [for c in local.kubelet_allow : { subnet = c }]
    }),
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "mayastor-nvmf"
      portSelector = { ports = [8420, 4421], protocol = "tcp" }
      ingress      = [for c in local.kubelet_allow : { subnet = c }]
    }),
    # Cilium BGP to the spine IRB 10.40.10.1 — allow TCP 179 from the fabric.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "cilium-bgp"
      portSelector = { ports = [179], protocol = "tcp" }
      ingress      = [{ subnet = local.kube_cidr }]
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
