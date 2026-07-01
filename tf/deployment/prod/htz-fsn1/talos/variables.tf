# Hybrid prod cluster topology — the single source of truth (clusters.auto.tfvars).
# One object, not a map: this stack's bring-up is bespoke (cloud CP via hcloud
# user_data + bare-metal workers via apid apply), so a for_each map buys nothing.

variable "cluster" {
  description = "The prod hybrid Talos cluster (Star Wars name; prod = 'father')."
  type = object({
    name               = string
    talos_version      = string
    kubernetes_version = string

    # The Image Factory schematic (extension set) is managed in TF — see
    # schematic.yaml + talos_image_factory_schematic in image.tf. The schematic id
    # and image URLs derive from it, so they're NOT inputs here.
    install_disk = string

    cilium_version = string
    hubble         = bool

    # NetBird CGNAT range node IPs come from (kubelet nodeIP.validSubnets). NetBird
    # Cloud default is 100.64.0.0/10. The node plane (CP↔worker) rides this mesh.
    netbird_node_cidr = string

    # ── Cloud control plane (Hetzner Cloud) ──────────────────────────────────
    cp_count       = number # 3
    cp_server_type = string # ccx23 (dedicated vCPU x86)
    cp_location    = string # fsn1
    cp_ip_offset   = number # CP[i] private (kube-cp) IP = cidrhost(kube_cp, offset+i)
    lb_type        = string # lb11
    lb_ip_offset   = number # API LB private IP = cidrhost(kube_cp, offset)
    lb_public      = bool   # also expose a public frontend (operators/workers reach it)

    # ── Bare-metal workers (Hetzner Robot) ────────────────────────────────────
    # maint_ip = the Hetzner public IP the node comes up on in Talos maintenance
    # mode (DHCP) — the endpoint for the one-time config apply. fabric_ip = the
    # post-install kube (VLAN 10) address (nodeIP + worker east-west); the apiserver
    # reaches the kubelet there via NetBird→mgmt, and the node reaches the apiserver
    # over its own NetBird peer.
    workers = list(object({
      name      = optional(string) # hostname override; null = auto-pick
      fabric_ip = string           # 10.40.10.x on the kube fabric VLAN
      maint_ip  = string           # Hetzner public IP (maintenance-mode apid endpoint)
      robot_id  = number           # Hetzner Robot server number (provisioning/doc)
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
