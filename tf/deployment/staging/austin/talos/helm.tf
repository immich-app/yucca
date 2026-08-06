# Nodes stay NotReady until this lands (cni:none in the module); same apply,
# right after bootstrap — one apply yields a Ready cluster. KPR → Talos
# KubePrism localhost:7445.
resource "helm_release" "cilium" {
  count = local.cluster_spec.cni == "cilium" ? 1 : 0

  name       = "cilium"
  namespace  = "kube-system"
  repository = "https://helm.cilium.io"
  chart      = "cilium"
  version    = local.cluster_spec.cilium_version

  values = [templatefile("${path.module}/cilium-values.yaml.tftpl", {
    kube_proxy_replacement = local.cluster_spec.disable_kube_proxy
    hubble                 = local.cluster_spec.hubble
  })]

  wait            = true
  timeout         = 600
  cleanup_on_fail = true
}

# Only AFTER the CNI is in is node-Ready achievable; turns a
# Cilium-up-but-cluster-unhealthy state into a hard apply failure.
data "talos_cluster_health" "post_cni" {
  count = local.cluster_spec.cni == "cilium" ? 1 : 0

  client_configuration = local.k8s.client_configuration
  control_plane_nodes  = local.k8s.cp_node_ips
  endpoints            = local.k8s.cp_node_ips

  timeouts = {
    read = "10m"
  }

  depends_on = [helm_release.cilium]
}
