# This stack installs in-cluster resources (Cilium via Helm), so the helm
# provider must bind to ONE cluster. `one()` enforces exactly one entry in
# var.clusters — manage any additional cluster in its own stack rather than
# fanning a single provider across a for_each.
locals {
  only_cluster_key = one(keys(var.clusters))
  cluster_spec     = var.clusters[local.only_cluster_key]
  k8s              = module.cluster[local.only_cluster_key]
}

# Host = direct bootstrap-CP IP (not the VIP): reachable immediately after
# bootstrap, and in the apiserver cert SANs. Credentials come from the Talos-
# minted admin kubeconfig (known after the cluster_kubeconfig resource applies).
provider "helm" {
  kubernetes = {
    host                   = local.k8s.operator_endpoint
    client_certificate     = base64decode(local.k8s.kubernetes_client_configuration.client_certificate)
    client_key             = base64decode(local.k8s.kubernetes_client_configuration.client_key)
    cluster_ca_certificate = base64decode(local.k8s.kubernetes_client_configuration.ca_certificate)
  }
}

# Same cluster creds — used by flux.tf for the git-auth Secret.
provider "kubernetes" {
  host                   = local.k8s.operator_endpoint
  client_certificate     = base64decode(local.k8s.kubernetes_client_configuration.client_certificate)
  client_key             = base64decode(local.k8s.kubernetes_client_configuration.client_key)
  cluster_ca_certificate = base64decode(local.k8s.kubernetes_client_configuration.ca_certificate)
}
