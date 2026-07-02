# Cluster access recorded in 1Password (yucca_tf_prod), so operators fetch creds
# with `op read` instead of pulling TF state. Titles match the discovery refs.
data "onepassword_vault" "prod" {
  name = "yucca_tf_${coalesce(var.partition, "prod")}"
}

resource "onepassword_item" "kubeconfig" {
  vault    = data.onepassword_vault.prod.uuid
  title    = upper("YUCCA_${coalesce(var.partition, "PROD")}_KUBECONFIG")
  category = "password"
  password = talos_cluster_kubeconfig.this.kubeconfig_raw
}

resource "onepassword_item" "talosconfig" {
  vault    = data.onepassword_vault.prod.uuid
  title    = upper("YUCCA_${coalesce(var.partition, "PROD")}_TALOSCONFIG")
  category = "password"
  password = data.talos_client_configuration.this.talos_config
}

# ─── cert-manager Secret (namespace: cert-manager) ───────────────────────────
# Cloudflare API token for the Let's Encrypt DNS-01 ClusterIssuer (futo.network;
# op://shared_tf/CLOUDFLARE_API_TOKEN). The cert-manager workload itself is Flux
# (apps/base/cert-manager via the prod overlay); only the secret is TF-provisioned.
resource "kubernetes_namespace_v1" "cert_manager" {
  metadata {
    name = "cert-manager"
  }
}

resource "kubernetes_secret_v1" "cloudflare_api_token" {
  metadata {
    name      = "cloudflare-api-token"
    namespace = kubernetes_namespace_v1.cert_manager.metadata[0].name
  }
  data = {
    api-token = var.cloudflare_api_token
  }
}
