# App + observability secrets, provisioned directly by TF (no ESO / 1Password
# Connect). This stack is already the 1P integration point, so it owns the
# cluster's secret material end-to-end:
#
#   • JWT keypair  — GENERATED here (tls_private_key), written to 1P as the
#                    source-of-truth record, and split into the two app Secrets
#                    (yucca-api signs with the private key, michael verifies
#                    with the public one — they MUST be the same pair).
#   • OIDC / RGW   — externally issued, human-managed in 1P; read via TF_VAR
#                    (op:// refs in tf/.env) and written into the app Secrets.
#   • vmauth token — shared o11y credential (shared_tf_staging), for vmagent egress.
#
# Each Secret is named after its chart's fullnameOverride so the chart's own
# `secretData` fixture (nulled in the staging HelmRelease) cedes the name and
# the app's existing `envFrom` picks this Secret up unchanged.
#
# Gated on cni == "cilium" (same as flux.tf) so the kubernetes/onepassword
# providers only engage for a real in-cluster deployment.

locals {
  provision_secrets = local.cluster_spec.cni == "cilium"
}

# ─── JWT keypair (generated) ────────────────────────────────────────────

# ES256 (P-256) keypair. private_key_pem_pkcs8 emits the PKCS#8 `BEGIN PRIVATE
# KEY` form the app expects; public_key_pem emits the SPKI `BEGIN PUBLIC KEY`
# form michael verifies with.
resource "tls_private_key" "yucca_jwt" {
  count       = local.provision_secrets ? 1 : 0
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"

  # NO prevent_destroy — deliberately: this resource is count-gated (flipping
  # cni would plan a destroy) and staging clusters are rebuildable by design;
  # the 1P YUCCA_JWT_KEYPAIR record is the survives-state-loss source of truth.
  # Revisit when the prod app secrets stack lands — prod's key SHOULD be
  # prevent_destroy'd.
}

# Source-of-truth record in 1Password. Survives state loss and is visible/
# shareable; the cluster Secrets below are created from the tls resource
# directly (no read-back), so 1P and the cluster never diverge on first apply.
data "onepassword_vault" "staging" {
  count = local.provision_secrets ? 1 : 0
  name  = "yucca_tf_staging"
}

resource "onepassword_item" "yucca_jwt" {
  count    = local.provision_secrets ? 1 : 0
  vault    = data.onepassword_vault.staging[0].uuid
  title    = "YUCCA_JWT_KEYPAIR"
  category = "password"

  password = tls_private_key.yucca_jwt[0].private_key_pem_pkcs8

  section {
    label = "keypair"
    field {
      label = "public_key"
      type  = "STRING"
      value = tls_private_key.yucca_jwt[0].public_key_pem
    }
  }
}

# ES256 keypair for yucca-admin-api's CLI session JWTs (yuctl login). Separate
# trust domain from yucca_jwt on purpose: admin-api both signs and verifies,
# and nothing else may accept these tokens.
resource "tls_private_key" "yucca_admin_jwt" {
  count       = local.provision_secrets ? 1 : 0
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "onepassword_item" "yucca_admin_jwt" {
  count    = local.provision_secrets ? 1 : 0
  vault    = data.onepassword_vault.staging[0].uuid
  title    = "YUCCA_ADMIN_JWT_KEYPAIR"
  category = "password"

  password = tls_private_key.yucca_admin_jwt[0].private_key_pem_pkcs8

  section {
    label = "keypair"
    field {
      label = "public_key"
      type  = "STRING"
      value = tls_private_key.yucca_admin_jwt[0].public_key_pem
    }
  }
}

# ─── Cluster access (recorded in 1P) ────────────────────────────────────
# kubeconfig + talosconfig, so operators fetch them with `op read` instead of
# pulling TF state.
resource "onepassword_item" "kubeconfig" {
  count    = local.provision_secrets ? 1 : 0
  vault    = data.onepassword_vault.staging[0].uuid
  title    = "YUCCA_STAGING_KUBECONFIG"
  category = "password"
  password = local.k8s.kubeconfig
}

resource "onepassword_item" "talosconfig" {
  count    = local.provision_secrets ? 1 : 0
  vault    = data.onepassword_vault.staging[0].uuid
  title    = "YUCCA_STAGING_TALOSCONFIG"
  category = "password"
  password = local.k8s.talosconfig
}

# ─── Namespaces ─────────────────────────────────────────────────────────
# Created here so the Secrets have a home at bootstrap, before Flux reconciles.
# Flux's overlays also declare these Namespaces; a bare Namespace is safe under
# dual ownership (server-side apply ensures-exists from whichever arrives first).

resource "kubernetes_namespace_v1" "yucca" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name = "yucca"
  }
  depends_on = [helm_release.cilium]
}

resource "kubernetes_namespace_v1" "observability" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name = "observability"
  }
  depends_on = [helm_release.cilium]
}

resource "kubernetes_namespace_v1" "cert_manager" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name = "cert-manager"
  }
  depends_on = [helm_release.cilium]
}

# ─── App Secrets (namespace: yucca) ─────────────────────────────────────

# yucca-api: signs JWTs with the generated private key + its OIDC client creds.
resource "kubernetes_secret_v1" "yucca_api" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "yucca-api"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    JWT_PRIVATE_KEY       = tls_private_key.yucca_jwt[0].private_key_pem_pkcs8
    OIDC_CLIENT_ID        = var.yucca_oidc_client_id
    OIDC_CLIENT_SECRET    = var.yucca_oidc_client_secret
    OIDC_DEVICE_CLIENT_ID = var.yucca_oidc_device_client_id
    INTERNAL_SECRET       = random_password.yucca_internal_secret[0].result
  }
}

# yucca-admin-api: its own OIDC client (admin console).
resource "kubernetes_secret_v1" "yucca_admin_api" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "yucca-admin-api"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    JWT_PRIVATE_KEY          = tls_private_key.yucca_admin_jwt[0].private_key_pem_pkcs8
    OIDC_ADMIN_CLIENT_ID     = var.yucca_oidc_admin_client_id
    OIDC_ADMIN_CLIENT_SECRET = var.yucca_oidc_admin_client_secret
    # Restic repository tokens (POST /repository/:id/url, used by yuctl tools
    # bench): deliberately the yucca_jwt SIGNING key — michael only accepts
    # tokens from that keypair. Admin session JWTs stay on yucca_admin_jwt.
    RESTIC_JWT_PRIVATE_KEY = tls_private_key.yucca_jwt[0].private_key_pem_pkcs8
    # Shared internal-API secret: presented to futo-backups-bot's
    # /internal/drops/* for eager invite-drop closure.
    INTERNAL_SECRET = random_password.yucca_internal_secret[0].result
    # Empty until the 1P ref is minted — admin-api then logs and skips sends
    # instead of crashing (see docs/email.md).
    POSTMARK_SERVER_TOKEN = var.yucca_postmark_server_token
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_admin_client_id) > 0 && length(var.yucca_oidc_admin_client_secret) > 0
      error_message = "yucca-admin-api OIDC client creds are empty — the code exchange 500s with invalid_client; check the shared_tf refs in tf/.env."
    }
  }
}

# michael: verifies yucca-api's JWTs with the public key + RGW S3 creds for the
# restic object store (reached via the in-cluster HAProxy → bare-metal Ceph).
resource "kubernetes_secret_v1" "yucca_michael" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "yucca-michael"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    JWT_PUBLIC_KEY       = tls_private_key.yucca_jwt[0].public_key_pem
    S3_ACCESS_KEY_ID     = var.yucca_rgw_access_key_id
    S3_SECRET_ACCESS_KEY = var.yucca_rgw_secret_access_key
  }
}

# yucca-metrics-worker: a separate RGW user WITH admin caps, so the worker can
# pull per-bucket usage from the sietch RGW admin API (michael's plain S3 user
# can't). Keys are AccessKey/SecretKey to match the chart's radosSecretName
# lookup. Injected via TF_VAR from 1P now; moves to the yucca_tf_staging vault.
resource "kubernetes_secret_v1" "yucca_metrics_rgw" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "yucca-metrics-rgw"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    AccessKey = var.sietch_metrics_worker_access_key
    SecretKey = var.sietch_metrics_worker_secret_key
  }
}

# Shared secret for yucca-api's /api/internal/* endpoints; yucca-api verifies,
# futo-backups-bot presents. TF-generated (no 1P item to mint), mirrored into
# 1P like the JWT keypairs so it survives state loss.
resource "random_password" "yucca_internal_secret" {
  count   = local.provision_secrets ? 1 : 0
  length  = 48
  special = false
}

resource "onepassword_item" "yucca_internal_secret" {
  count    = local.provision_secrets ? 1 : 0
  vault    = data.onepassword_vault.staging[0].uuid
  title    = "YUCCA_INTERNAL_API_SECRET"
  category = "password"

  password = random_password.yucca_internal_secret[0].result
}

# futo-backups-bot: Discord gateway token + the shared internal-API secret
# + sietch RGW keys for ticket transcripts. Deliberately no precondition: the
# token and S3 keys default empty so this Secret can land before their 1P
# items exist — the bot idles without a token and skips the archive sweep
# without S3 keys.
resource "kubernetes_secret_v1" "futo_backups_bot" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "futo-backups-bot"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    DISCORD_BOT_TOKEN               = var.yucca_discord_bot_token
    INTERNAL_SECRET                 = random_password.yucca_internal_secret[0].result
    DISCORD_GUILD_ID                = var.yucca_discord_guild_id
    DISCORD_STAFF_ROLE_ID           = var.yucca_discord_staff_role_id
    DISCORD_SUPPORT_CHANNEL_ID      = var.yucca_discord_support_channel_id
    DISCORD_GENERAL_CHANNEL_ID      = var.yucca_discord_general_channel_id
    DISCORD_CHAT_CHANNEL_ID         = var.yucca_discord_chat_channel_id
    DISCORD_CUSTOMER_ROLE_ID        = var.yucca_discord_customer_role_id
    TRANSCRIPT_S3_ACCESS_KEY_ID     = var.sietch_transcripts_access_key
    TRANSCRIPT_S3_SECRET_ACCESS_KEY = var.sietch_transcripts_secret_key
  }
}

# yucca-database backups: the sietch RGW svc-yucca-db-backup S3 keys for the
# CNPG Barman Cloud plugin, plus the RGW's self-signed cert as the CA bundle
# (barman cannot skip TLS verification). The cert comes from the DR item that
# `mise run capture` snapshots off the ceph bootstrap node.
resource "kubernetes_secret_v1" "yucca_db_backup_s3" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "yucca-db-backup-s3"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    ACCESS_KEY_ID     = var.sietch_db_backup_access_key
    ACCESS_SECRET_KEY = var.sietch_db_backup_secret_key
    CA_CERT           = var.sietch_rgw_tls_cert
  }
}

# ─── cert-manager Secret (namespace: cert-manager) ──────────────────────
# Cloudflare API token for the Let's Encrypt DNS-01 ClusterIssuer (same 1P
# item the dns stack uses — Zone:Read + DNS:Edit on futo.cloud).
resource "kubernetes_secret_v1" "cloudflare_api_token" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "cloudflare-api-token"
    namespace = kubernetes_namespace_v1.cert_manager[0].metadata[0].name
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

