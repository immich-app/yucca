# ─── Flux bootstrap (flux.tf) ───────────────────────────────────────────

variable "flux_operator_version" {
  description = "Chart version for flux-operator + flux-instance (OCI ghcr.io/controlplaneio-fluxcd/charts). Mirrors yucca-o11y."
  type        = string
  # Need ≥0.53.0: 0.50.0's eventSources patch targets versions[1] of the
  # notification CRD (now single-version) → FluxInstance build fails, no controllers.
  default = "0.53.0"
}

# Commit-status Provider auth via a GitHub App (no PAT); public repo/images, so
# no git-sync or GHCR pull secret. TEMPORARY: shared `push-o-matic` app
# (op://shared_tf/GITHUB_APP_IMMICH_PUSH_O_MATIC); repoint tf/.env to the
# dedicated "yucca-flux" app (Commit statuses: write only) once created.
variable "flux_github_app_id" {
  description = "GitHub App ID (numeric) for the commit-status Provider. Injected via TF_VAR from 1P (push-o-matic, op://shared_tf)."
  type        = string
  default     = ""
}

variable "flux_github_app_installation_id" {
  description = "GitHub App installation ID on the immich-app org. Injected via TF_VAR from 1P (push-o-matic, op://shared_tf)."
  type        = string
  default     = ""
}

variable "flux_github_app_private_key" {
  description = "GitHub App private key (raw PEM). Injected via TF_VAR from 1P (push-o-matic, op://shared_tf); empty default keeps `tofu validate` clean."
  type        = string
  sensitive   = true
  default     = ""
}

# ─── App secrets (secrets.tf) ───────────────────────────────────────────
# Human-managed secrets in 1P (yucca_tf_staging_manual app creds, shared_tf_staging
# vmauth token), injected via TF_VAR from op:// refs in tf/.env. Empty defaults
# keep validate clean and let the slice deploy before values exist. JWT keypair
# is NOT here — TF generates it (secrets.tf).

# yucca-api OIDC client (registered out-of-band in the staging IdP).
variable "yucca_oidc_client_id" {
  description = "OIDC client ID for yucca-api (staging IdP). Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

variable "yucca_oidc_client_secret" {
  description = "OIDC client secret for yucca-api (staging IdP). Injected via TF_VAR from 1P."
  type        = string
  sensitive   = true
  default     = ""
}

# Device-flow client: separate PUBLIC client (no secret), DEVICE_CODE grant.
variable "yucca_oidc_device_client_id" {
  description = "Public OIDC client ID for yucca-api's device flow. Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

# yucca-admin-api OIDC: the internal-tooling app on auth.internal.futo.org,
# shared with prod (FUTO_ZITADEL_OAUTH_*_YUCCA_INTERNAL_TOOLING in shared_tf).
variable "yucca_oidc_admin_client_id" {
  description = "OIDC client ID for yucca-admin-api (internal-tooling app). Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

variable "yucca_oidc_admin_client_secret" {
  description = "OIDC client secret for yucca-admin-api (internal-tooling app; ref stays commented in tf/.env until minted). Injected via TF_VAR from 1P."
  type        = string
  sensitive   = true
  default     = ""
}

# michael S3 creds — svc-yucca-restic RGW user on sietch, created by ceph
# Ansible with predetermined keys; duplicated into yucca_tf_staging
# (SIETCH_CEPH_S3_SVC_YUCCA_RESTIC_{ACCESS,SECRET}_KEY) for the staging SA.
# Endpoint via in-cluster HAProxy → s3.dev.austin.int.futo.cloud.
variable "yucca_rgw_access_key_id" {
  description = "RGW (S3) access key for michael (svc-yucca-restic). Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

variable "yucca_rgw_secret_access_key" {
  description = "RGW (S3) secret key for michael (svc-yucca-restic). Injected via TF_VAR from 1P."
  type        = string
  sensitive   = true
  default     = ""
}

variable "sietch_metrics_worker_access_key" {
  description = "Sietch RGW admin access key for yucca-metrics-worker (per-bucket usage via the RGW admin API). Injected via TF_VAR from 1P; moves to the yucca_tf_staging vault."
  type        = string
  default     = ""
}

variable "sietch_metrics_worker_secret_key" {
  description = "Sietch RGW admin secret key for yucca-metrics-worker. Injected via TF_VAR from 1P; moves to the yucca_tf_staging vault."
  type        = string
  sensitive   = true
  default     = ""
}

# vmagent remote-write bearer = shared_tf_staging VICTORIAMETRICS_VMAUTH_PASSWORD
# (the `remote-clusters` VMUser).
variable "vmauth_remote_write_password" {
  description = "o11y vmauth bearer token for vmagent remote-write. Injected via TF_VAR from 1P (shared_tf_staging/VICTORIAMETRICS_VMAUTH_PASSWORD)."
  type        = string
  sensitive   = true
  default     = ""
}

# cert-manager DNS-01 token (futo.cloud); same 1P item as the dns stack.
variable "cloudflare_api_token" {
  description = "Cloudflare API token (Zone:Read + DNS:Edit on futo.cloud) for cert-manager DNS-01. Injected via TF_VAR from 1P."
  type        = string
  sensitive   = true
  default     = ""
}

# ─── NetBird ────────────────────────────────────────────────────────────
# Node-extension setup key + operator API token, both minted by the
# staging/netbird stack (yucca_tf_staging vault), injected via TF_VAR. Empty
# defaults let the slice deploy before that stack is applied.

variable "netbird_talos_setup_key" {
  description = "NetBird setup key for the node-level siderolabs/netbird extension (group YUCCA_STAGING_TALOS). Injected via TF_VAR from 1P (op://yucca_tf_staging/NETBIRD_YUCCA_STAGING_TALOS_SETUP_KEY)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "netbird_operator_api_token" {
  description = "NetBird API token for the in-cluster kubernetes operator (service user yucca-staging-k8s-operator). Bootstrapped into the netbird-mgmt-api-key Secret. Injected via TF_VAR from 1P (op://yucca_tf_staging/NETBIRD_YUCCA_STAGING_K8S_OPERATOR_API_TOKEN)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "clusters" {
  description = "Map of bare-metal Talos cluster specs keyed by themed cluster name (Star Wars; e.g. 'luke'). Declarative: add/modify an entry in clusters.auto.tfvars + tf:apply."
  type = map(object({
    talos_version      = string
    kubernetes_version = optional(string)
    talos_schematic_id = optional(string)
    install_disk       = optional(string, "/dev/sda")

    # Control-plane Layer-2 VIP + API endpoint.
    cluster_vip      = string
    cluster_endpoint = optional(string)

    # Node subnet routing.
    gateway     = string
    subnet_cidr = string
    nameservers = optional(list(string), ["1.1.1.1", "8.8.8.8"])

    allow_scheduling_on_control_planes = optional(bool, true)

    # CNI: "flannel" (Talos bundled) | "cilium" (cni:none + Helm, set cilium_version) | "none".
    cni                = optional(string, "flannel")
    disable_kube_proxy = optional(bool, false)
    cilium_version     = optional(string)
    hubble             = optional(bool, false)

    # Talos host ingress firewall (default-deny + per-service allow-lists).
    enable_ingress_firewall = optional(bool, true)
    trusted_cidrs           = optional(list(string), [])
    trust_tailscale         = optional(bool, true)
    pod_cidr                = optional(string, "10.244.0.0/16")

    bond = object({
      name             = optional(string, "bond0")
      interfaces       = list(string)
      mode             = optional(string, "802.3ad")
      lacp_rate        = optional(string, "fast")
      xmit_hash_policy = optional(string, "layer3+4")
      miimon           = optional(number, 100)
    })

    nodes = list(object({
      name    = optional(string) # auto-picked from the node-names inventory when omitted
      role    = optional(string, "control-plane")
      address = string
    }))

    config_patches = optional(list(string), [])
  }))
}
