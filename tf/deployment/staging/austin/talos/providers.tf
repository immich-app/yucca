# helm provider binds to ONE cluster; `one()` enforces a single clusters entry —
# additional clusters get their own stack.
locals {
  only_cluster_key = one(keys(var.clusters))
  cluster_spec     = var.clusters[local.only_cluster_key]
  k8s              = module.cluster[local.only_cluster_key]
}

# Host = direct bootstrap-CP IP, not the VIP (reachable right after bootstrap,
# in the cert SANs); creds from the Talos-minted admin kubeconfig.
provider "helm" {
  kubernetes = {
    host                   = local.k8s.operator_endpoint
    client_certificate     = base64decode(local.k8s.kubernetes_client_configuration.client_certificate)
    client_key             = base64decode(local.k8s.kubernetes_client_configuration.client_key)
    cluster_ca_certificate = base64decode(local.k8s.kubernetes_client_configuration.ca_certificate)
  }
}

# Same creds — used by flux.tf + secrets.tf.
provider "kubernetes" {
  host                   = local.k8s.operator_endpoint
  client_certificate     = base64decode(local.k8s.kubernetes_client_configuration.client_certificate)
  client_key             = base64decode(local.k8s.kubernetes_client_configuration.client_key)
  cluster_ca_certificate = base64decode(local.k8s.kubernetes_client_configuration.ca_certificate)
}

# 1P (secrets.tf) via OP_SERVICE_ACCOUNT_TOKEN from op run; no Connect host.
provider "onepassword" {}
