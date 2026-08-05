# Talos host ingress firewall (default-deny + per-service allow-lists). Governs
# HOST-network ports only; pod/ClusterIP traffic rides Cilium.
#
# Trust planes:
#   kube_cidr        10.40.10.0/24  workers' fabric IPs (east-west, BGP)
#   kube_cp_cidr     10.40.11.0/24  CP IPs + the API VIP (etcd, apiserver)
#   netbird_node_cidr 10.254.0.0/15 the NetBird mesh (operators, backup plane)
#   trusted_cidrs    operator/CI source ranges
#
# ⚠️ The TF runner dials the CP kube-cp IPs (over the NetBird kube-cp route) for
# bootstrap (apid 50000) and the helm/kubernetes providers (apiserver 6443). Its
# source IP MUST be in trusted_cidrs (e.g. the CI runner's NetBird range) or
# those steps hang.
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
    # CP↔worker routed via the spine IRBs — or pod-to-pod traffic is silently dropped.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "cilium-geneve"
      portSelector = { ports = [6081], protocol = "udp" }
      ingress      = [for c in local.firewall_allow : { subnet = c }]
    }),
    # OpenEBS Mayastor: the control plane dials each io-engine's gRPC (10124) and
    # each csi-node's gRPC (10199, hostPort) on the node IP, and replicated volumes
    # attach + replicate over NVMe-oF/TCP (8420 target, 4421 nexus) node-to-node.
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
    # Spegel P2P image mirror: a node fetching an unpacked layer connects to the peer
    # that has it at PEER_IP:29999 (the registry hostPort advertised as --local-addr;
    # 30021 is the nodePort fallback mirror target). Same-node containerd→local-Spegel
    # is loopback; this rule covers the cross-node fetch. Ingress is the fabric + pod
    # CIDR (kubelet_allow) ONLY — with the default-deny above, the hostPort is never
    # reachable from the public NIC. The router/P2P membership plane rides Cilium
    # (ClusterIP), so no host rule is needed for it.
    yamlencode({
      apiVersion   = "v1alpha1"
      kind         = "NetworkRuleConfig"
      name         = "spegel-registry"
      portSelector = { ports = [29999, 30021], protocol = "tcp" }
      ingress      = [for c in local.kubelet_allow : { subnet = c }]
    }),
    # Cilium BGP (workers ↔ the spine IRB on VLAN 10): the node BGP speakers advertise
    # LoadBalancer /32s to the core. Peer is 10.40.10.1 (kube net), so allow TCP 179
    # from the fabric.
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
