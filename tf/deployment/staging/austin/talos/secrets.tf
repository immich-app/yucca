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

resource "kubernetes_namespace_v1" "netbird" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name = "netbird"
  }
  depends_on = [helm_release.cilium]
}

# ─── App Secrets (namespace: yucca) ─────────────────────────────────────

# Shared secret authenticating michael's token-introspection calls against
# yucca-api (GET /internal/restic-tokens/:jti). Generated in-state: rotation is
# harmless (michael briefly degrades to its grace window), so no 1P record.
resource "random_password" "token_introspection" {
  count   = local.provision_secrets ? 1 : 0
  length  = 48
  special = false
}

# yucca-api: signs JWTs with the generated private key + its OIDC client creds.
resource "kubernetes_secret_v1" "yucca_api" {
  count = local.provision_secrets ? 1 : 0
  metadata {
    name      = "yucca-api"
    namespace = kubernetes_namespace_v1.yucca[0].metadata[0].name
  }
  data = {
    JWT_PRIVATE_KEY            = tls_private_key.yucca_jwt[0].private_key_pem_pkcs8
    OIDC_CLIENT_ID             = var.yucca_oidc_client_id
    OIDC_CLIENT_SECRET         = var.yucca_oidc_client_secret
    OIDC_DEVICE_CLIENT_ID      = var.yucca_oidc_device_client_id
    TOKEN_INTROSPECTION_SECRET = random_password.token_introspection[0].result
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
    JWT_PUBLIC_KEY             = tls_private_key.yucca_jwt[0].public_key_pem
    S3_ACCESS_KEY_ID           = var.yucca_rgw_access_key_id
    S3_SECRET_ACCESS_KEY       = var.yucca_rgw_secret_access_key
    TOKEN_INTROSPECTION_SECRET = random_password.token_introspection[0].result
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

# ─── NetBird operator Secret (namespace: netbird) ───────────────────────
# Management API token (service user yucca-staging-k8s-operator) the operator
# authenticates with. Key name NB_API_KEY matches the chart's default
# netbirdAPI.keyFromSecret. Minted by the staging/netbird stack; read here via
# TF_VAR from 1P. The operator HelmRelease (Flux) mounts this Secret.
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
