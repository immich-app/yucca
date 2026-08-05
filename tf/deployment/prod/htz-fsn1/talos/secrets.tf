# Cluster access recorded in 1Password (yucca_tf_prod), so operators fetch creds
# with `op read` instead of pulling TF state. Titles match the discovery refs.
data "onepassword_vault" "prod" {
  name = "yucca_tf_${coalesce(var.partition, "prod")}"
}

# Titles from the discovery locals so items and refs can't drift. Retitling
# recreates the 1P items (old YUCCA_PROD_{KUBE,TALOS}CONFIG need manual archive).
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
# DNS-01 token (futo.network; op://shared_tf/CLOUDFLARE_API_TOKEN). The workload
# is Flux-managed; only the secret is TF-provisioned.
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
    # "" default keeps validate clean; must never reach the cluster
    # (cert-manager silently stops renewing).
    precondition {
      condition     = length(var.cloudflare_api_token) > 0
      error_message = "cloudflare_api_token is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}

# ─── App secrets (yucca workload set) ────────────────────────────────────────
# Mirrors staging/austin/talos/secrets.tf. Secret names = chart fullnameOverride
# (dev secretData fixture nulled in the HelmReleases) so envFrom picks these up.

# ES256 JWT keypair: yucca-api signs, michael verifies. 1P record = source of
# truth; prevent_destroy — rotating invalidates every issued token.
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

# admin-api CLI-session JWTs (yuctl login). Separate trust domain from yucca_jwt
# on purpose — nothing else may accept these tokens.
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

# Namespaces pre-Flux so Secrets have a home; dual ownership safe (bare Namespace, SSA).
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

# yucca-api: JWT signing key + OIDC creds (prod Zitadel,
# CUSTOMER_ZITADEL_OAUTH_*_YUCCA_WEB / _YUCCA_ORCHESTRATOR).
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
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_client_id) > 0 && length(var.yucca_oidc_client_secret) > 0
      error_message = "yucca OIDC client creds are empty — run applies through tf/op-run.sh with OP_ENV_FILE=tf/.env.prod."
    }
  }
}

# yucca-admin-api: own OIDC client — empty creds until the admin console launches.
resource "kubernetes_secret_v1" "yucca_admin_api" {
  metadata {
    name      = "yucca-admin-api"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    JWT_PRIVATE_KEY          = tls_private_key.yucca_admin_jwt.private_key_pem_pkcs8
    OIDC_ADMIN_CLIENT_ID     = var.yucca_oidc_admin_client_id
    OIDC_ADMIN_CLIENT_SECRET = var.yucca_oidc_admin_client_secret
    # Restic repo tokens (yuctl tools bench): deliberately the yucca_jwt SIGNING
    # key — michael only accepts that keypair. Sessions stay on yucca_admin_jwt.
    RESTIC_JWT_PRIVATE_KEY = tls_private_key.yucca_jwt.private_key_pem_pkcs8
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_admin_client_id) > 0 && length(var.yucca_oidc_admin_client_secret) > 0
      error_message = "yucca-admin-api OIDC client creds are empty — the code exchange 500s with invalid_client; check the shared_tf refs in tf/.env.prod."
    }
  }
}

# michael: JWT public key + spice RGW svc-yucca-restic S3 keys (out-of-band
# contract items, seeded into the RGW by the ceph ansible).
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

# yucca-metrics-worker: separate RGW user WITH admin caps; AccessKey/SecretKey
# match the chart's radosSecretName lookup.
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
