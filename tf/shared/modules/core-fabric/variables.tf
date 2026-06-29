# core-fabric — the shared site spine VC (corenetsw). Carries the VC config, the
# 100G->4x25G breakout, and the L2 stretch of each cluster's VLANs over the
# spine<->leaf LAG. The spine has NO IRBs (gateways live on the cluster leaves).
#
# NOTE: the spine is shared across all clusters. Today it carries cluster 1's
# VLANs; as clusters are added, extend the vlans/trunk membership here (the
# vlan ids below are wired to cluster 1's addressing). The configured (aliased)
# junos-qfx provider for the spine VC is passed in by the stack.

variable "public_vlan_id" {
  type        = number
  description = "Public VLAN id to stretch to the spine (cluster 1 = 20)."
}

variable "private_vlan_id" {
  type        = number
  description = "Private VLAN id to stretch to the spine (cluster 1 = 22)."
}

variable "vc_member_serials" {
  type        = list(string)
  description = "The spine VC member chassis serials (member 0, member 1)."
  validation {
    condition     = length(var.vc_member_serials) == 2
    error_message = "The spine is a pair: provide exactly two serials."
  }
}

variable "breakout_ports" {
  type        = list(number)
  default     = [0, 1, 2, 3]
  description = "QSFP28 ports channelized 100G->4x25G on each VC member."
}

variable "breakout_speed" {
  type        = string
  default     = "25g"
  description = "Per-channel speed for the breakout ports."
}

variable "aggregated_device_count" {
  type        = number
  default     = 16
  description = "chassis aggregated-devices ethernet device-count."
}

variable "api_vlan_id" {
  type        = number
  description = "Site-global API VLAN id to stretch (carried on all clusters)."
}

variable "mgmt_vlan_id" {
  type        = number
  description = "Site-global management VLAN id to stretch."
}

variable "mgmt_trusted_sources" {
  type        = list(string)
  default     = ["10.40.5.0/24", "10.254.0.0/15", "100.64.0.0/10", "127.0.0.0/8"]
  description = "Source prefixes allowed to reach SSH/NETCONF on the RE (lo0 PROTECT-RE filter, applied when transit exists). OOB + NetBird + Tailscale + loopback."
}

variable "local_as" {
  type        = number
  default     = null
  description = "Our ASN for transit eBGP (e.g. 402421). Required when var.transits is non-empty."
}

variable "transits" {
  description = <<-EOT
    Upstream IP-transit eBGP uplinks on the spine, keyed by name (= bgp group
    name; policies derive as <UPPER>-OUT/-IN). Multi-home by adding entries:
    `prepend` (0 = primary) AS-path-prepends our advertisement on backups;
    `local_pref` (highest = the outbound default route). Import is default-only.
    See transit.tf — prepend/local_pref need a provider regen (JTAF) to apply.
  EOT
  type = map(object({
    interface  = string              # uplink port (e.g. et-0/0/27)
    local_v4   = string              # our /31 (e.g. 5.56.17.225/31)
    local_v6   = string              # our /64 (e.g. 2a01:4a0:1338:226::2/64)
    peer_v4    = string              # provider v4 (e.g. 5.56.17.224)
    peer_v6    = string              # provider v6 (e.g. 2a01:4a0:1338:226::1)
    peer_as    = number              # provider ASN (e.g. 33891)
    advertise  = string              # prefix to originate + advertise
    loopback   = optional(string)    # lo0 host in the advertised space (e.g. 69.48.224.254/32)
    prepend    = optional(number, 0) # times to prepend our AS on export (backups)
    local_pref = optional(number)    # local-pref on the received default (primary highest)
  }))
  default = {}
}
