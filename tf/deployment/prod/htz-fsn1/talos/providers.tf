# helm + kubernetes bind to ONE cluster: the bootstrap CP's directly-reachable
# apiserver (over the NetBird kube-cp route) — up immediately after bootstrap and
# in the cert SANs, unlike the VIP which only settles once etcd elects a holder.
# Creds come from the Talos-minted admin kubeconfig (known after
# talos_cluster_kubeconfig applies).
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
