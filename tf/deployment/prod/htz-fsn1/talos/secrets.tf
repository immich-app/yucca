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

# Per-repository storage credentials. STORAGE_CREDENTIAL_KEY encrypts the RGW
# secret keys at rest in postgres; STORAGE_CREDENTIAL_SEAL_KEY is shared with
# michael and seals them into each restic token. Both are 32-byte AES-256 keys.
# prevent_destroy: losing the at-rest key orphans every repository's stored
# credential, and losing the seal key invalidates every token in flight.
resource "random_bytes" "yucca_storage_credential_key" {
  length = 32

  lifecycle {
    prevent_destroy = true
  }
}

resource "random_bytes" "yucca_storage_seal_key" {
  length = 32

  lifecycle {
    prevent_destroy = true
  }
}

resource "onepassword_item" "yucca_storage_keys" {
  vault    = data.onepassword_vault.prod.uuid
  title    = "YUCCA_STORAGE_CREDENTIAL_KEYS"
  category = "password"

  password = random_bytes.yucca_storage_credential_key.base64

  section {
    label = "keys"
    field {
      label = "seal_key"
      type  = "STRING"
      value = random_bytes.yucca_storage_seal_key.base64
    }
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
    # Per-repository storage credentials: sealed at rest with the first key,
    # sealed into restic tokens with the second (michael holds only the second).
    STORAGE_CREDENTIAL_KEY      = random_bytes.yucca_storage_credential_key.base64
    STORAGE_CREDENTIAL_SEAL_KEY = random_bytes.yucca_storage_seal_key.base64
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
    # Same storage-credential keys as yucca-api: admin-created repositories and
    # admin-minted restic URLs go through the identical provisioning path.
    STORAGE_CREDENTIAL_KEY      = random_bytes.yucca_storage_credential_key.base64
    STORAGE_CREDENTIAL_SEAL_KEY = random_bytes.yucca_storage_seal_key.base64
  }

  lifecycle {
    precondition {
      condition     = length(var.yucca_oidc_admin_client_id) > 0 && length(var.yucca_oidc_admin_client_secret) > 0
      error_message = "yucca-admin-api OIDC client creds are empty — the code exchange 500s with invalid_client; check the shared_tf refs in tf/.env.prod."
    }
  }
}

# michael: verifies yucca-api's JWTs and opens the per-repository S3 credentials
# they carry. It holds no S3 keys of its own.
resource "kubernetes_secret_v1" "yucca_michael" {
  metadata {
    name      = "yucca-michael"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    JWT_PUBLIC_KEY              = tls_private_key.yucca_jwt.public_key_pem
    STORAGE_CREDENTIAL_SEAL_KEY = random_bytes.yucca_storage_seal_key.base64
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

# yucca-api / yucca-admin-api: the RGW user with users+buckets admin caps, used
# to create one S3 user per repository. Keys are AccessKey/SecretKey to match
# the charts' radosSecretName lookup, as with yucca-metrics-rgw.
resource "kubernetes_secret_v1" "yucca_provisioner_rgw" {
  metadata {
    name      = "yucca-provisioner-rgw"
    namespace = kubernetes_namespace_v1.yucca.metadata[0].name
  }
  data = {
    AccessKey = var.spice_provisioner_access_key
    SecretKey = var.spice_provisioner_secret_key
  }

  lifecycle {
    precondition {
      condition     = length(var.spice_provisioner_access_key) > 0 && length(var.spice_provisioner_secret_key) > 0
      error_message = "spice provisioner RGW keys are empty — run applies through tf/op-run.sh."
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
