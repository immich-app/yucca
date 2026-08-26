# All-bare-metal prod cluster topology — the single source of truth
# (clusters.auto.tfvars). One object, not a map: this stack's bring-up is bespoke
# (CPs + workers both driven over apid, but with different planes/volumes), so a
# for_each map buys nothing.

variable "cluster" {
  description = "The prod bare-metal Talos cluster (Star Wars name; prod = 'father')."
  type = object({
    name               = string
    talos_version      = string
    kubernetes_version = string

    # The Image Factory schematic (extension set) is managed in TF — see
    # schematic.yaml + talos_image_factory_schematic in image.tf. The schematic id
    # and image URLs derive from it, so they're NOT inputs here.

    cilium_version = string
    hubble         = bool

    # NetBird mesh range (host firewall trust + operator plane). THIS account
    # assigns 10.254.0.0/15 (see clusters.auto.tfvars) — not the NetBird Cloud
    # default of 100.64.0.0/10.
    netbird_node_cidr = string

    # ── Bare-metal control planes (Hetzner Robot; kube-cp fabric VLAN 11) ─────
    # cp_ip = the post-install kube-cp (VLAN 11) address — etcd + apiserver +
    # nodeIP; the spine routes kube↔kube-cp. maint_ip = the Hetzner public IP the
    # node comes up on in Talos maintenance mode (DHCP on the onboard 1G NIC) —
    # the endpoint for the one-time install apply.
    cps = list(object({
      name = string # EXPLICIT node name (wordlist-style) — keys the apply resources; renaming = node replacement
      # Install-disk serial — NOT a device name: sda/sdb enumeration is not
      # stable across boots, and a name-based install target could point an
      # upgrade at the wrong disk.
      install_serial = string
      cp_ip          = string               # 10.40.11.x on the kube-cp fabric VLAN
      maint_ip       = string               # Hetzner public IP (maintenance-mode apid endpoint)
      robot_id       = number               # Hetzner Robot server number (provisioning/doc)
      provisioned    = optional(bool, true) # false ONLY while first-provisioning: config
      # applies then target maint_ip (maintenance mode); true = target cp_ip (live).
    }))
    # CP fabric bond members (2×10G Intel 82599 SFP+). Selected by NIC driver —
    # ixgbe matches exactly the two 10G ports (the onboard 1G public NIC is e1000e).
    cp_bond_driver     = optional(string)
    cp_bond_interfaces = optional(list(string), [])
    # API VIP = cidrhost(kube_cp, vip_offset) — Talos etcd-elected, floats between
    # the CPs on VLAN 11. 5 keeps the retired hcloud LB's IP, so the api_dns_name
    # record (NetBird DNS zone) carried over unchanged.
    vip_offset = number

    # ── Bare-metal workers (Hetzner Robot; kube fabric VLAN 10) ───────────────
    # maint_ip/fabric_ip semantics as for cps; nodeIP = fabric_ip (worker east-west
    # rides VLAN 10 at 50G, apiserver↔kubelet routes via the spine IRBs).
    workers = list(object({
      name           = string
      install_serial = string
      fabric_ip      = string # 10.40.10.x on the kube fabric VLAN
      maint_ip       = string
      robot_id       = number
      provisioned    = optional(bool, true)
    }))
    # Fabric bond members. Prefer worker_bond_driver (a Talos deviceSelector by NIC
    # driver, e.g. "bnxt_en") — robust across per-node PCI naming. worker_bond_interfaces
    # (explicit Talos names) is the fallback when a driver match is ambiguous.
    worker_bond_driver     = optional(string)
    worker_bond_interfaces = optional(list(string), [])
    # Worker default route (egress for image pulls + NetBird): via the kube fabric
    # IRB gateway (fabric transit) when true, else the Hetzner public NIC (DHCP).
    worker_default_route_via_fabric = optional(bool, true)
  })

  validation {
    condition     = length(distinct(concat(var.cluster.cps[*].name, var.cluster.workers[*].name))) == length(var.cluster.cps) + length(var.cluster.workers)
    error_message = "Node names must be unique across CPs and workers."
  }
}

# NetBird setup key for the node-level siderolabs/netbird extension (CP + workers
# both join the same site network). Injected via TF_VAR from 1P (op run); the
# netbird stack mints it (op://yucca_tf_prod/NETBIRD_YUCCA_PROD_HTZ_FSN1_..._KEY).
variable "netbird_talos_setup_key" {
  description = "NetBird setup key for the WORKERS (group: talos). Sensitive."
  type        = string
  sensitive   = true
  default     = ""
}

variable "netbird_talos_cp_setup_key" {
  description = "NetBird setup key for the CONTROL PLANES (groups: talos + talos_cp, the kube-cp router group). Sensitive."
  type        = string
  sensitive   = true
  default     = ""
}

# Extra operator/CI source CIDRs allowed on the Talos host firewall (apid 50000 +
# apiserver 6443), on top of the node planes + NetBird range. e.g. the CI runner's
# NetBird range. The host running `tf apply` MUST be in one of these or apid hangs.
variable "trusted_cidrs" {
  description = "Extra source CIDRs allowed on the Talos ingress firewall (operator/CI)."
  type        = list(string)
  default     = []
}

# ── Flux (flux.tf) ────────────────────────────────────────────────────────────
variable "flux_operator_version" {
  description = "flux-operator + flux-instance chart version. 0.53.0+: 0.50.0's built-in eventSources CRD patch breaks against current Flux 2.x (see staging)."
  type        = string
  default     = "0.53.0"
}

variable "flux_git_ref" {
  description = "Git branch Flux syncs."
  type        = string
  default     = "main"
}

variable "flux_github_app_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "flux_github_app_installation_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "flux_github_app_private_key" {
  type      = string
  sensitive = true
  default   = ""
}

# The talos_cluster_health data sources are BOOTSTRAP sequencing gates. Post-
# bootstrap they re-run on every plan/apply and any transient (an apiserver cert
# rotation, a worker mid-reboot, a runner-side mesh blip) fails the whole run —
# they blocked several day-2 applies. Enable only for greenfield bring-up.
variable "bootstrap_health_gate" {
  description = "Run the cluster-health gates (greenfield bootstrap only)."
  type        = bool
  default     = false
}

# Cloudflare API token for cert-manager's Let's Encrypt DNS-01 solver (the
# futo.network zone). op://shared_tf/CLOUDFLARE_API_TOKEN via tf/.env.prod.
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
  default   = ""
}

# ─── App secrets (secrets.tf) ────────────────────────────────────────────────
# Externally-issued / human-managed creds from yucca_tf_prod (+ shared_tf_prod
# for the vmauth token), injected via TF_VAR from op:// refs in tf/.env.prod.
# Empty defaults keep credential-less `tofu validate` clean; the Secret
# preconditions refuse to ship empties to the cluster.

variable "yucca_oidc_client_id" {
  description = "OIDC client ID for yucca-api (prod Zitadel, CUSTOMER_ZITADEL_OAUTH_CLIENT_ID_YUCCA_WEB)."
  type        = string
  default     = ""
}

variable "yucca_oidc_client_secret" {
  description = "OIDC client secret for yucca-api (prod Zitadel)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "yucca_oidc_device_client_id" {
  description = "Public OIDC client ID for yucca-api's device flow (CUSTOMER_ZITADEL_OAUTH_CLIENT_ID_YUCCA_ORCHESTRATOR)."
  type        = string
  default     = ""
}

variable "yucca_oidc_admin_client_id" {
  description = "OIDC client ID for yucca-admin-api (internal-tooling app on auth.internal.futo.org; FUTO_ZITADEL_OAUTH_CLIENT_ID_YUCCA_INTERNAL_TOOLING in shared_tf)."
  type        = string
  default     = ""
}

variable "yucca_oidc_admin_client_secret" {
  description = "OIDC client secret for yucca-admin-api (FUTO_ZITADEL_OAUTH_CLIENT_SECRET_YUCCA_INTERNAL_TOOLING in shared_tf; ref stays commented in tf/.env.prod until minted)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "yucca_postmark_server_token" {
  description = "Postmark server API token for invite/transactional email (ref stays commented in tf/.env.prod until minted; empty token = admin-api logs and skips sends)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "yucca_rgw_access_key_id" {
  description = "Spice RGW (S3) access key for michael (svc-yucca-restic, out-of-band contract item)."
  type        = string
  default     = ""
}

variable "yucca_rgw_secret_access_key" {
  description = "Spice RGW (S3) secret key for michael (svc-yucca-restic)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "spice_metrics_worker_access_key" {
  description = "Spice RGW admin access key for yucca-metrics-worker (per-bucket usage via the RGW admin API)."
  type        = string
  default     = ""
}

variable "spice_metrics_worker_secret_key" {
  description = "Spice RGW admin secret key for yucca-metrics-worker."
  type        = string
  sensitive   = true
  default     = ""
}

variable "spice_db_backup_access_key" {
  description = "Spice RGW (S3) access key for CNPG database backups (svc-yucca-db-backup, TF-minted SPICE_CEPH_S3_SVC_YUCCA_DB_BACKUP_ACCESS_KEY)."
  type        = string
  default     = ""
}

variable "spice_db_backup_secret_key" {
  description = "Spice RGW (S3) secret key for CNPG database backups (svc-yucca-db-backup)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "spice_rgw_tls_cert" {
  description = "Spice RGW self-signed TLS certificate PEM (DR item SPICE_CEPH_RGW_TLS_CERT, snapshotted by `mise run capture`); CA bundle for the CNPG barman ObjectStore."
  type        = string
  default     = ""
}

variable "vmauth_remote_write_password" {
  description = "o11y prod vmauth bearer token for vmagent/logs remote-write (shared_tf_prod/O11Y_VICTORIAMETRICS_VMAUTH_PASSWORD)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "yucca_discord_bot_token" {
  description = "Discord bot token for futo-backups-bot (FUTOBackupsBot). Empty = the bot boots idle; ref stays commented in tf/.env.prod until minted."
  type        = string
  sensitive   = true
  default     = ""
}

variable "spice_transcripts_access_key" {
  description = "Spice RGW (S3) access key for futo-backups-bot ticket transcripts (svc-yucca-transcripts, TF-minted SPICE_CEPH_S3_SVC_YUCCA_TRANSCRIPTS_ACCESS_KEY). Empty = the archive sweep skips."
  type        = string
  sensitive   = true
  default     = ""
}

variable "spice_transcripts_secret_key" {
  description = "Spice RGW (S3) secret key for futo-backups-bot ticket transcripts (svc-yucca-transcripts)."
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




variable "yucca_discord_chat_channel_id" {
  description = "#chat channel id mentioned after a role claim (YUCCA_DISCORD_SUPPORT_IDS)."
  type        = string
  default     = ""
}

variable "yucca_discord_customer_role_id" {
  description = "FUTO Backups customer role id futo-backups-bot assigns on claim (YUCCA_DISCORD_SUPPORT_IDS)."
  type        = string
  default     = ""
}

variable "yucca_discord_general_channel_id" {
  description = "#general channel id for futo-backups-bot's daily claim prompt (YUCCA_DISCORD_SUPPORT_IDS)."
  type        = string
  default     = ""
}
