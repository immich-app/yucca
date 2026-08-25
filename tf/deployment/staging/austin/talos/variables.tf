# ─── Flux bootstrap (flux.tf) ───────────────────────────────────────────

variable "flux_operator_version" {
  description = "Chart version for flux-operator + flux-instance (OCI ghcr.io/controlplaneio-fluxcd/charts). Mirrors yucca-o11y."
  type        = string
  # 0.53.0+: 0.50.0's built-in eventSources patch targets versions[1] of the
  # notification CRD, which current Flux 2.x collapsed to one version → the
  # FluxInstance build fails ("doc is missing path …/eventSources/…/enum/-") and
  # no controllers install. 0.53.0 handles the single-version CRD.
  default = "0.53.0"
}

# Commit-status Provider auth via a GitHub App (no PAT). notification-controller
# mints + rotates installation tokens from these. yucca is a public repo with
# public images, so NO git-sync or GHCR pull secret is needed.
#
# TEMPORARY: fed from the SHARED `push-o-matic` app (op://shared_tf/
# GITHUB_APP_IMMICH_PUSH_O_MATIC) — see tf/.env. The dedicated least-privilege
# "yucca-flux" app ("Commit statuses: write" only) isn't created yet; repoint
# the tf/.env refs to it when it is.
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
#
# Externally-issued / human-managed secrets. Live in 1P (yucca_tf_staging_manual
# for app creds, shared_tf_staging for the shared vmauth token) and are injected via
# TF_VAR from op:// refs in tf/.env. Empty defaults keep `tofu validate` clean
# and let the staging slice deploy before the real values are populated — the
# apps come up, just without working OIDC / object storage / metrics egress.
#
# The JWT keypair is NOT here: TF generates it (tls_private_key in secrets.tf).

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

# yucca-admin-api OIDC client (separate registration from yucca-api): the
# internal-tooling app on auth.internal.futo.org, shared with prod
# (FUTO_ZITADEL_OAUTH_*_YUCCA_INTERNAL_TOOLING in shared_tf).
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

variable "yucca_postmark_server_token" {
  description = "Postmark server API token for invite/transactional email (ref stays commented in tf/.env until minted; empty token = admin-api logs and skips sends). Injected via TF_VAR from 1P."
  type        = string
  sensitive   = true
  default     = ""
}

# michael S3 credentials — the `svc-yucca-restic` RGW user on the bare-metal
# Ceph (sietch / dev Ceph), created by the ceph Ansible with predetermined keys;
# duplicated into yucca_tf_staging (op://yucca_tf_staging/SIETCH_CEPH_S3_SVC_
# YUCCA_RESTIC_{ACCESS,SECRET}_KEY) so the staging SA can read them. michael
# reaches the endpoint via the in-cluster HAProxy fronting
# s3.dev.austin.int.futo.cloud. Not manual, not Rook-generated.
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

variable "sietch_db_backup_access_key" {
  description = "Sietch RGW (S3) access key for CNPG database backups (svc-yucca-db-backup, TF-minted SIETCH_CEPH_S3_SVC_YUCCA_DB_BACKUP_ACCESS_KEY)."
  type        = string
  default     = ""
}

variable "sietch_db_backup_secret_key" {
  description = "Sietch RGW (S3) secret key for CNPG database backups (svc-yucca-db-backup)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "sietch_rgw_tls_cert" {
  description = "Sietch RGW self-signed TLS certificate PEM (DR item SIETCH_CEPH_RGW_TLS_CERT, snapshotted by `mise run capture`); CA bundle for the CNPG barman ObjectStore."
  type        = string
  default     = ""
}

# Cloudflare API token for the cert-manager DNS-01 ClusterIssuer (futo.cloud
# zone). Same 1P item the dns stack uses. Injected via TF_VAR from 1P.
variable "cloudflare_api_token" {
  description = "Cloudflare API token (Zone:Read + DNS:Edit on futo.cloud) for cert-manager DNS-01. Injected via TF_VAR from 1P."
  type        = string
  sensitive   = true
  default     = ""
}

# ─── NetBird ────────────────────────────────────────────────────────────
#
# Setup key for the node-level siderolabs/netbird system extension, minted by
# the staging/netbird stack and stored in the yucca_tf_staging vault; injected
# here via TF_VAR from op:// refs in tf/.env. The empty default keeps
# `tofu validate` clean and lets the slice deploy before the netbird stack has
# been applied.

# Per-node overlay: each Talos node joins NetBird via the extension's NB_SETUP_KEY.
variable "netbird_talos_setup_key" {
  description = "NetBird setup key for the node-level siderolabs/netbird extension (group YUCCA_STAGING_TALOS). Injected via TF_VAR from 1P (op://yucca_tf_staging/NETBIRD_YUCCA_STAGING_TALOS_SETUP_KEY)."
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

    # CNI: "flannel" (Talos bundled) | "cilium" (cni:none + Cilium via Helm) |
    # "none". When "cilium", set cilium_version; kube-proxy replacement +
    # Hubble are controlled below.
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

variable "yucca_discord_bot_token" {
  description = "Discord bot token for futo-backups-bot (FUTOBackupsBot). Empty = the bot boots idle; ref stays commented in tf/.env until minted."
  type        = string
  sensitive   = true
  default     = ""
}

variable "sietch_transcripts_access_key" {
  description = "Sietch RGW (S3) access key for futo-backups-bot ticket transcripts (svc-yucca-transcripts, TF-minted SIETCH_CEPH_S3_SVC_YUCCA_TRANSCRIPTS_ACCESS_KEY). Empty = the archive sweep skips."
  type        = string
  sensitive   = true
  default     = ""
}

variable "sietch_transcripts_secret_key" {
  description = "Sietch RGW (S3) secret key for futo-backups-bot ticket transcripts (svc-yucca-transcripts)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "yucca_discord_guild_id" {
  description = "Discord server id for futo-backups-bot (YUCCA_DISCORD_SUPPORT_IDS, written by core-infra-tf's discord apply). Empty = the bot idles."
  type        = string
  default     = ""
}

variable "yucca_discord_staff_role_id" {
  description = "Staff (Yucca) role id for futo-backups-bot (YUCCA_DISCORD_SUPPORT_IDS)."
  type        = string
  default     = ""
}

variable "yucca_discord_support_channel_id" {
  description = "#support channel id for futo-backups-bot's pinned button (YUCCA_DISCORD_SUPPORT_IDS)."
  type        = string
  default     = ""
}


