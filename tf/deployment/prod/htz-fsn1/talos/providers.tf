# helm/kubernetes dial the bootstrap CP's apiserver directly (up right after
# bootstrap, in cert SANs — the VIP only settles on etcd election); creds from
# the Talos-minted admin kubeconfig.
provider "helm" {
  kubernetes = {
    host                   = local.operator_endpoint
    client_certificate     = base64decode(local.kube_client_config.client_certificate)
    client_key             = base64decode(local.kube_client_config.client_key)
    cluster_ca_certificate = base64decode(local.kube_client_config.ca_certificate)
  }
}

provider "kubernetes" {
  host                   = local.operator_endpoint
  client_certificate     = base64decode(local.kube_client_config.client_certificate)
  client_key             = base64decode(local.kube_client_config.client_key)
  cluster_ca_certificate = base64decode(local.kube_client_config.ca_certificate)
}

# 1Password — persists the kube/talosconfig into yucca_tf_prod (secrets.tf). Auth
# via OP_SERVICE_ACCOUNT_TOKEN (op run).
provider "onepassword" {}
