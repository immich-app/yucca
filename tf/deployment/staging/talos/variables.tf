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
