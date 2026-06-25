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
