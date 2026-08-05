# App + o11y secrets provisioned by TF (no ESO / 1P Connect). JWT keypair is
# GENERATED here (1P = source of truth; yucca-api signs, michael verifies — must
# be the same pair); OIDC/RGW are human-managed in 1P, read via TF_VAR (op://
# refs in tf/.env). Secret names = chart fullnameOverride so the chart's nulled
# secretData cedes the name and envFrom picks these up. Gated on cni == "cilium"
# (same as flux.tf).

locals {
  provision_secrets = local.cluster_spec.cni == "cilium"
}

# ─── JWT keypair (generated) ────────────────────────────────────────────

# ES256 keypair: PKCS#8 private form for the app, SPKI public form for michael.
resource "tls_private_key" "yucca_jwt" {
  count       = local.provision_secrets ? 1 : 0
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"

  # NO prevent_destroy, deliberately: count-gated (cni flip plans a destroy) and
  # staging is rebuildable; 1P YUCCA_JWT_KEYPAIR is the source of truth. Prod's
  # key SHOULD be prevent_destroy'd.
}

# 1P source-of-truth record (survives state loss); cluster Secrets come from the
# tls resource directly, so 1P and cluster never diverge on first apply.
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

# admin-api CLI-session JWTs (yuctl login). Separate trust domain from yucca_jwt
# on purpose — nothing else may accept these tokens.
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
# Operators fetch kubeconfig/talosconfig with `op read`, not TF state.
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
# Created pre-Flux so Secrets have a home at bootstrap. Flux also declares them;
# bare Namespaces are safe under dual ownership (SSA ensure-exists).

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

resource "kubernetes_namespace_v1" "netbird" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name = "netbird"
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
    # Restic repo tokens (yuctl tools bench): deliberately the yucca_jwt SIGNING
    # key — michael only accepts that keypair. Sessions stay on yucca_admin_jwt.
    RESTIC_JWT_PRIVATE_KEY = tls_private_key.yucca_jwt[0].private_key_pem_pkcs8
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_admin_client_id) > 0 && length(var.yucca_oidc_admin_client_secret) > 0
      error_message = "yucca-admin-api OIDC client creds are empty — the code exchange 500s with invalid_client; check the shared_tf refs in tf/.env."
    }
  }
}

# michael: JWT public key + RGW S3 creds (in-cluster HAProxy → bare-metal Ceph).
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

# yucca-metrics-worker: separate RGW user WITH admin caps (michael's plain S3
# user can't read the admin API). AccessKey/SecretKey match the chart's
# radosSecretName lookup. Moves to the yucca_tf_staging vault.
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

# ─── Observability Secret (namespace: observability) ────────────────────
# Bearer token vmagent + vlagent present to o11y's vmauth for remote-write.
resource "kubernetes_secret_v1" "vmagent_remote_write" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "vmagent-remote-write"
    namespace = kubernetes_namespace_v1.observability[0].metadata[0].name
  }
  data = {
    token = var.vmauth_remote_write_password
  }
}

# ─── cert-manager Secret (namespace: cert-manager) ──────────────────────
# Cloudflare token for DNS-01 (same 1P item as the dns stack; Zone:Read + DNS:Edit on futo.cloud).
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
    # "" default keeps validate clean; must never reach the cluster
    # (cert-manager silently stops renewing).
    precondition {
      condition     = length(var.cloudflare_api_token) > 0
      error_message = "cloudflare_api_token is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}

# ─── NetBird operator Secret (namespace: netbird) ───────────────────────
# Mgmt API token (service user yucca-staging-k8s-operator), minted by the
# staging/netbird stack. NB_API_KEY matches the chart's netbirdAPI.keyFromSecret;
# mounted by the operator HelmRelease.
resource "kubernetes_secret_v1" "netbird_mgmt_api_key" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "netbird-mgmt-api-key"
    namespace = kubernetes_namespace_v1.netbird[0].metadata[0].name
  }
  data = {
    NB_API_KEY = var.netbird_operator_api_token
  }
}
