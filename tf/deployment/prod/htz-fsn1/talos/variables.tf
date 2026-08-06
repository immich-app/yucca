variable "cluster" {
  description = "The prod bare-metal Talos cluster (Star Wars name; prod = 'father')."
  type = object({
    name               = string
    talos_version      = string
    kubernetes_version = string

    cilium_version = string
    hubble         = bool

    # NetBird mesh range: this account uses 10.254.0.0/15, NOT the Cloud
    # default 100.64.0.0/10.
    netbird_node_cidr = string

    cps = list(object({
      name = string # EXPLICIT node name (wordlist-style) — keys the apply resources; renaming = node replacement
      # Serial, NOT device name — sda/sdb enumeration isn't stable across boots.
      install_serial = string
      cp_ip          = string               # 10.40.11.x on the kube-cp fabric VLAN
      maint_ip       = string               # Hetzner public IP (maintenance-mode apid endpoint)
      robot_id       = number               # Hetzner Robot server id (console/API)
      provisioned    = optional(bool, true) # false ONLY while first-provisioning: config
      # applies then target maint_ip (maintenance mode); true = target cp_ip (live).
    }))
    # CP bond = 2×10G SFP+, matched by driver ixgbe (onboard 1G public NIC is e1000e).
    cp_bond_driver     = optional(string)
    cp_bond_interfaces = optional(list(string), [])
    # 5 keeps the retired hcloud LB's IP so the api_dns_name record carried over.
    vip_offset = number

    workers = list(object({
      name           = string
      install_serial = string
      fabric_ip      = string # 10.40.10.x on the kube fabric VLAN
      maint_ip       = string
      robot_id       = number
      provisioned    = optional(bool, true)
    }))
    # Prefer worker_bond_driver (deviceSelector; robust across per-node PCI
    # naming); explicit interfaces are the fallback for ambiguous driver matches.
    worker_bond_driver     = optional(string)
    worker_bond_interfaces = optional(list(string), [])
    # true → kube IRB gateway; false → the Hetzner public NIC (DHCP).
    worker_default_route_via_fabric = optional(bool, true)
  })

  validation {
    condition     = length(distinct(concat(var.cluster.cps[*].name, var.cluster.workers[*].name))) == length(var.cluster.cps) + length(var.cluster.workers)
    error_message = "Node names must be unique across CPs and workers."
  }
}

# NetBird setup keys, minted by the netbird stack
# (op://yucca_tf_prod/NETBIRD_YUCCA_PROD_HTZ_FSN1_..._KEY), injected via TF_VAR.
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

# The `tf apply` host MUST be in one or apid hangs.
variable "trusted_cidrs" {
  description = "Extra source CIDRs allowed on the Talos ingress firewall (operator/CI)."
  type        = list(string)
  default     = []
}

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

# Health gates re-run every plan post-bootstrap and any transient fails the run
# (blocked several day-2 applies). Greenfield bring-up only.
variable "bootstrap_health_gate" {
  description = "Run the cluster-health gates (greenfield bootstrap only)."
  type        = bool
  default     = false
}

# cert-manager DNS-01 (futo.network); op://shared_tf/CLOUDFLARE_API_TOKEN via tf/.env.prod.
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
  default   = ""
}

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

variable "vmauth_remote_write_password" {
  description = "o11y prod vmauth bearer token for vmagent/logs remote-write (shared_tf_prod/O11Y_VICTORIAMETRICS_VMAUTH_PASSWORD)."
  type        = string
  sensitive   = true
  default     = ""
}
