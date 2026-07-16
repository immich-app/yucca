# Cilium CNI — installed post-bootstrap in the same apply (helm provider bound to
# the bootstrap CP, providers.tf). Talos set cni:none + proxy:disabled, so nodes
# go Ready only once this lands the datapath. Geneve tunnel routing spans the two
# routed fabric VLANs (kube/kube-cp); worker east-west still rides the 50G fabric
# (cilium-values.yaml.tftpl).
resource "helm_release" "cilium" {
  name       = "cilium"
  namespace  = "kube-system"
  repository = "https://helm.cilium.io"
  chart      = "cilium"
  version    = var.cluster.cilium_version

  values = [templatefile("${path.module}/cilium-values.yaml.tftpl", {
    pod_cidr               = local.pod_cidr
    kube_proxy_replacement = true
    hubble                 = var.cluster.hubble
  })]

  wait            = true
  timeout         = 600
  cleanup_on_fail = true

  depends_on = [talos_cluster_kubeconfig.this]
}

# Full health gate AFTER the CNI is in — now node-Ready is achievable.
data "talos_cluster_health" "post_cni" {
  count = var.bootstrap_health_gate ? 1 : 0

  client_configuration = talos_machine_secrets.this.client_configuration
  control_plane_nodes  = local.cp_ips
  worker_nodes         = [for w in var.cluster.workers : w.fabric_ip]
  endpoints            = local.cp_ips

  timeouts = { read = "10m" }

  depends_on = [helm_release.cilium]
}
