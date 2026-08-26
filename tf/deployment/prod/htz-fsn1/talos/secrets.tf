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

# ─── App secrets (yucca workload set) ────────────────────────────────────────
# Mirrors staging/austin/talos/secrets.tf: this stack is the 1P integration
# point, so it owns the app secret material. Each Secret is named after its
# chart's fullnameOverride (the chart's dev `secretData` fixture is nulled in
# the HelmReleases) so the apps' envFrom picks these up unchanged.

# ES256 (P-256) JWT keypair: yucca-api signs, michael verifies. The 1P record
# is the survives-state-loss source of truth; prevent_destroy because rotating
# it invalidates every issued token AND michael's verification of them.
resource "tls_private_key" "yucca_jwt" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"

  lifecycle {
    prevent_destroy = true
  }
}

resource "onepassword_item" "yucca_jwt" {
  vault    = data.onepassword_vault.prod.uuid
  title    = "YUCCA_JWT_KEYPAIR"
  category = "password"

  password = tls_private_key.yucca_jwt.private_key_pem_pkcs8

  section {
    label = "keypair"
    field {
      label = "public_key"
      type  = "STRING"
      value = tls_private_key.yucca_jwt.public_key_pem
    }
  }
}

# ES256 keypair for yucca-admin-api's CLI session JWTs (yuctl login). Separate
# trust domain from yucca_jwt on purpose: admin-api both signs and verifies,
# and nothing else may accept these tokens.
resource "tls_private_key" "yucca_admin_jwt" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"

  lifecycle {
    prevent_destroy = true
  }
}

resource "onepassword_item" "yucca_admin_jwt" {
  vault    = data.onepassword_vault.prod.uuid
  title    = "YUCCA_ADMIN_JWT_KEYPAIR"
  category = "password"

  password = tls_private_key.yucca_admin_jwt.private_key_pem_pkcs8

  section {
    label = "keypair"
    field {
      label = "public_key"
      type  = "STRING"
      value = tls_private_key.yucca_admin_jwt.public_key_pem
    }
  }
}

# Namespaces created here so the Secrets have a home before Flux reconciles;
# the Flux overlays declare them too (bare Namespace is safe under dual SSA).
resource "kubernetes_namespace_v1" "yucca" {
  metadata {
    name = "yucca"
  }
}

resource "kubernetes_namespace_v1" "observability" {
  metadata {
    name = "observability"
  }
}

# yucca-api: signs JWTs with the generated private key + its OIDC client creds
# (prod Zitadel, CUSTOMER_ZITADEL_OAUTH_*_YUCCA_WEB / _YUCCA_ORCHESTRATOR).
resource "kubernetes_secret_v1" "yucca_api" {
  metadata {
    name      = "yucca-api"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    JWT_PRIVATE_KEY       = tls_private_key.yucca_jwt.private_key_pem_pkcs8
    OIDC_CLIENT_ID        = var.yucca_oidc_client_id
    OIDC_CLIENT_SECRET    = var.yucca_oidc_client_secret
    OIDC_DEVICE_CLIENT_ID = var.yucca_oidc_device_client_id
    INTERNAL_SECRET       = random_password.yucca_internal_secret.result
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_client_id) > 0 && length(var.yucca_oidc_client_secret) > 0
      error_message = "yucca OIDC client creds are empty — run applies through tf/op-run.sh with OP_ENV_FILE=tf/.env.prod."
    }
  }
}

# yucca-admin-api: its own OIDC client — not registered yet (mirrors staging:
# empty creds until the admin console launches).
resource "kubernetes_secret_v1" "yucca_admin_api" {
  metadata {
    name      = "yucca-admin-api"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    JWT_PRIVATE_KEY          = tls_private_key.yucca_admin_jwt.private_key_pem_pkcs8
    OIDC_ADMIN_CLIENT_ID     = var.yucca_oidc_admin_client_id
    OIDC_ADMIN_CLIENT_SECRET = var.yucca_oidc_admin_client_secret
    # Restic repository tokens (POST /repository/:id/url, used by yuctl tools
    # bench): deliberately the yucca_jwt SIGNING key — michael only accepts
    # tokens from that keypair. Admin session JWTs stay on yucca_admin_jwt.
    RESTIC_JWT_PRIVATE_KEY = tls_private_key.yucca_jwt.private_key_pem_pkcs8
    # Shared internal-API secret: presented to futo-backups-bot's
    # /internal/drops/* for eager invite-drop closure.
    INTERNAL_SECRET = random_password.yucca_internal_secret.result
    # Empty until the 1P ref is minted — admin-api then logs and skips sends
    # instead of crashing (see docs/email.md).
    POSTMARK_SERVER_TOKEN = var.yucca_postmark_server_token
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_admin_client_id) > 0 && length(var.yucca_oidc_admin_client_secret) > 0
      error_message = "yucca-admin-api OIDC client creds are empty — the code exchange 500s with invalid_client; check the shared_tf refs in tf/.env.prod."
    }
  }
}

# michael: verifies yucca-api's JWTs + the spice RGW svc-yucca-restic S3 keys
# (out-of-band contract items, seeded into the RGW by the ceph ansible).
resource "kubernetes_secret_v1" "yucca_michael" {
  metadata {
    name      = "yucca-michael"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    JWT_PUBLIC_KEY       = tls_private_key.yucca_jwt.public_key_pem
    S3_ACCESS_KEY_ID     = var.yucca_rgw_access_key_id
    S3_SECRET_ACCESS_KEY = var.yucca_rgw_secret_access_key
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_rgw_access_key_id) > 0 && length(var.yucca_rgw_secret_access_key) > 0
      error_message = "michael RGW S3 keys are empty — run applies through tf/op-run.sh with OP_ENV_FILE=tf/.env.prod."
    }
  }
}

# yucca-metrics-worker: separate RGW user WITH admin caps (per-bucket usage via
# the spice RGW admin API). Keys are AccessKey/SecretKey to match the chart's
# radosSecretName lookup.
resource "kubernetes_secret_v1" "yucca_metrics_rgw" {
  metadata {
    name      = "yucca-metrics-rgw"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    AccessKey = var.spice_metrics_worker_access_key
    SecretKey = var.spice_metrics_worker_secret_key
  }

  lifecycle {
    precondition {
      condition     = length(var.spice_metrics_worker_access_key) > 0 && length(var.spice_metrics_worker_secret_key) > 0
      error_message = "spice metrics-worker RGW keys are empty — run applies through tf/op-run.sh with OP_ENV_FILE=tf/.env.prod."
    }
  }
}

# Shared secret for yucca-api's /api/internal/* endpoints; yucca-api verifies,
# futo-backups-bot presents. TF-generated (no 1P item to mint), mirrored into
# 1P like the JWT keypairs so it survives state loss.
resource "random_password" "yucca_internal_secret" {
  length  = 48
  special = false
}

resource "onepassword_item" "yucca_internal_secret" {
  vault    = data.onepassword_vault.prod.uuid
  title    = "YUCCA_INTERNAL_API_SECRET"
  category = "password"

  password = random_password.yucca_internal_secret.result
}

# futo-backups-bot: Discord gateway token + the shared internal-API secret
# + spice RGW keys for ticket transcripts. Deliberately no precondition: the
# token and S3 keys default empty so this Secret can land before their 1P
# items exist — the bot idles without a token and skips the archive sweep
# without S3 keys.
resource "kubernetes_secret_v1" "futo_backups_bot" {
  metadata {
    name      = "futo-backups-bot"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    DISCORD_BOT_TOKEN               = var.yucca_discord_bot_token
    INTERNAL_SECRET                 = random_password.yucca_internal_secret.result
    DISCORD_GUILD_ID                = var.yucca_discord_guild_id
    DISCORD_STAFF_ROLE_ID           = var.yucca_discord_staff_role_id
    DISCORD_SUPPORT_CHANNEL_ID      = var.yucca_discord_support_channel_id
    DISCORD_GENERAL_CHANNEL_ID      = var.yucca_discord_general_channel_id
    DISCORD_CHAT_CHANNEL_ID         = var.yucca_discord_chat_channel_id
    DISCORD_CUSTOMER_ROLE_ID        = var.yucca_discord_customer_role_id
    TRANSCRIPT_S3_ACCESS_KEY_ID     = var.spice_transcripts_access_key
    TRANSCRIPT_S3_SECRET_ACCESS_KEY = var.spice_transcripts_secret_key
  }
}

# yucca-database backups: the spice RGW svc-yucca-db-backup S3 keys for the
# CNPG Barman Cloud plugin, plus the RGW's self-signed cert as the CA bundle
# (barman cannot skip TLS verification). The cert comes from the DR item that
# `mise run capture` snapshots off the ceph bootstrap node.
resource "kubernetes_secret_v1" "yucca_db_backup_s3" {
  metadata {
    name      = "yucca-db-backup-s3"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    ACCESS_KEY_ID     = var.spice_db_backup_access_key
    ACCESS_SECRET_KEY = var.spice_db_backup_secret_key
    CA_CERT           = var.spice_rgw_tls_cert
  }

  lifecycle {
    precondition {
      condition     = length(var.spice_db_backup_access_key) > 0 && length(var.spice_db_backup_secret_key) > 0 && length(var.spice_rgw_tls_cert) > 0
      error_message = "spice db-backup RGW keys or TLS cert are empty — run applies through tf/op-run.sh with OP_ENV_FILE=tf/.env.prod."
    }
  }
}

# ─── Observability Secret (namespace: observability) ─────────────────────────
# Bearer token vmagent + the logs collector present to o11y's prod vmauth.
resource "kubernetes_secret_v1" "vmagent_remote_write" {
  metadata {
    name      = "vmagent-remote-write"
    namespace = kubernetes_namespace_v1.observability.metadata[0].name
  }
  data = {
    token = var.vmauth_remote_write_password
  }

  lifecycle {
    precondition {
      condition     = length(var.vmauth_remote_write_password) > 0
      error_message = "vmauth_remote_write_password is empty — run applies through tf/op-run.sh with OP_ENV_FILE=tf/.env.prod."
    }
  }
}
