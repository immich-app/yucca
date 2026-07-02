# hcloud — the control-plane VMs, their private subnet, the API LB, and the Talos
# snapshot lookup. Token comes from HCLOUD_TOKEN (op run --env-file=tf/.env.prod).
provider "hcloud" {}

# helm + kubernetes bind to ONE cluster: the bootstrap CP's directly-reachable
# (public) apiserver — up immediately after bootstrap and in the cert SANs, unlike
# the LB which only goes healthy once an apiserver answers. Creds come from the
# Talos-minted admin kubeconfig (known after talos_cluster_kubeconfig applies).
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

# netbird — read-only worker peer lookups: their mesh IPs feed the CPs'
# extraHostEntries so the apiserver dials worker kubelets peer-to-peer over the
# mesh (no mgmt route in the path). PAT via NB_PAT (op run).
provider "netbird" {}
