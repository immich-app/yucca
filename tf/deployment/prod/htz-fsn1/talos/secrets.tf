# Cluster access recorded in 1Password (yucca_tf_prod), so operators fetch creds
# with `op read` instead of pulling TF state. Titles match the discovery refs.
data "onepassword_vault" "prod" {
  name = "yucca_tf_${coalesce(var.partition, "prod")}"
}

# Titles come from the discovery locals (region-scoped) so the written items and
# the discovery refs can never drift. NB: retitling recreates the 1P items — the
# old partition-scoped YUCCA_PROD_{KUBE,TALOS}CONFIG records need manual archive.
resource "onepassword_item" "kubeconfig" {
  vault    = data.onepassword_vault.prod.uuid
  title    = local._kubeconfig_title
  category = "password"
  password = talos_cluster_kubeconfig.this.kubeconfig_raw
}

resource "onepassword_item" "talosconfig" {
  vault    = data.onepassword_vault.prod.uuid
  title    = local._talosconfig_title
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

  lifecycle {
    # "" default keeps credential-less validate clean; never let it reach the
    # cluster (cert-manager would silently stop renewing).
    precondition {
      condition     = length(var.cloudflare_api_token) > 0
      error_message = "cloudflare_api_token is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}
