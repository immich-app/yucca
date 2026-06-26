# ─── Flux bootstrap (flux.tf) ───────────────────────────────────────────

variable "flux_operator_version" {
  description = "Chart version for flux-operator + flux-instance (OCI ghcr.io/controlplaneio-fluxcd/charts). Mirrors yucca-o11y."
  type        = string
  default     = "0.50.0"
}

# Commit-status Provider auth via a DEDICATED GitHub App (no PAT) — "yucca-flux"
# with only "Commit statuses: write". notification-controller mints + rotates
# installation tokens from these. yucca is a public repo with public images, so
# NO git-sync or GHCR pull secret is needed.
variable "flux_github_app_id" {
  description = "GitHub App ID (numeric) for the commit-status Provider. Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

variable "flux_github_app_installation_id" {
  description = "GitHub App installation ID on the immich-app org/repo. Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

variable "flux_github_app_private_key" {
  description = "GitHub App private key (raw PEM). Injected via TF_VAR from 1P; empty default keeps `tofu validate` clean."
  type        = string
  sensitive   = true
  default     = ""
}

# ─── App secrets (secrets.tf) ───────────────────────────────────────────
#
# Externally-issued / human-managed secrets. Live in 1P (yucca_tf_staging_manual
# for app creds, o11y_tf_staging for the shared vmauth token) and are injected via
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

# yucca-api device-flow OIDC client — a separate PUBLIC (non-confidential)
# client registered for the orchestrator's device authorization grant. No
# secret: public clients don't get one.
variable "yucca_oidc_device_client_id" {
  description = "Device-flow OIDC client ID for yucca-api (staging IdP, public client). Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

# yucca-admin-api OIDC client (separate registration from yucca-api).
variable "yucca_oidc_admin_client_id" {
  description = "OIDC client ID for yucca-admin-api (staging IdP). Injected via TF_VAR from 1P."
  type        = string
  default     = ""
}

variable "yucca_oidc_admin_client_secret" {
  description = "OIDC client secret for yucca-admin-api (staging IdP). Injected via TF_VAR from 1P."
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

# Bearer token vmagent uses to remote-write metrics to o11y's vmauth. This is
# the shared VICTORIAMETRICS_VMAUTH_PASSWORD from the o11y_tf_staging vault (the
# `remote-clusters` VMUser authenticates remote clusters with it).
variable "vmauth_remote_write_password" {
  description = "o11y vmauth bearer token for vmagent remote-write. Injected via TF_VAR from 1P (o11y_tf_staging/VICTORIAMETRICS_VMAUTH_PASSWORD)."
  type        = string
  sensitive   = true
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

variable "clusters" {
  description = "Map of bare-metal Talos cluster specs keyed by short cluster name. Declarative: add/modify an entry in clusters.auto.tfvars + tf:apply."
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
      name    = string
      role    = optional(string, "control-plane")
      address = string
    }))

    config_patches = optional(list(string), [])
  }))
}
