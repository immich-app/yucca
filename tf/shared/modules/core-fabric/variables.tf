# core-fabric — the shared site spine VC (corenetsw). Carries the VC config, the
# 100G->4x25G breakout, and the L2 stretch of each cluster's VLANs over the
# spine<->leaf LAG. The spine has NO IRBs (gateways live on the cluster leaves).
#
# NOTE: the spine is shared across all clusters. Today it carries cluster 1's
# VLANs; as clusters are added, extend the vlans/trunk membership here (the
# vlan ids below are wired to cluster 1's addressing). The configured (aliased)
# junos provider for the spine VC is passed in by the stack.

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
  type        = map(string)
  default     = { 0 = "25g", 1 = "25g", 2 = "25g", 3 = "25g" }
  description = <<-EOT
    QSFP28 ports channelized on each VC member: port number -> per-channel speed.
    25g -> et-<fpc>/0/<port>:0..3 legs; 10g -> xe-<fpc>/0/<port>:0..3. NB: 10g
    channelization needs a QSFP+ (40G-class) breakout cable — the QFX5200 silently
    falls back to unchannelized 100G on a QSFP28 cable.
  EOT
}

variable "kube_vlan_id" {
  type        = number
  description = "Site-global kube VLAN id to stretch (carried on all clusters)."
}

variable "mgmt_vlan_id" {
  type        = number
  description = "Site-global management VLAN id to stretch."
}

variable "host_mgmt_vlan_id" {
  type        = number
  description = "Per-cluster host-management VLAN id to stretch (cls1 -> 124)."
}

variable "mgmt_node_ports" {
  type        = list(string)
  default     = ["et-1/0/3:0", "et-0/0/3:0"]
  description = "Spine ports the management nodes attach to (mgmt-1, mgmt-2), each a single-port trunk of the stretched VLANs. One channelized port-3 leg per VC member."
}

variable "node_lags" {
  type        = map(list(string))
  default     = {}
  description = <<-EOT
    Bare-metal node LACP bonds terminated directly on the core (channelized 25G
    breakout ports). Key = ae name (ae1, ae2, …); value = the two member sub-ports,
    one per VC member, e.g. ["et-0/0/2:2", "et-1/0/2:3"]. Each ae is an LACP-active
    trunk carrying the kube VLAN (the nodes tag their fabric IP onto it). The two
    members MUST be the ports cabled to the SAME node — LACP won't aggregate ports
    facing different partners.
  EOT
}

variable "public_routing" {
  type = object({
    cidr = string # the cluster public network (e.g. 10.40.20.0/23)
    ip   = string # spine IRB address on that VLAN, CIDR form (e.g. 10.40.21.254/23)
  })
  default     = null
  description = <<-EOT
    When set, the spine gets an IRB on the cluster public VLAN and routes
    kube ↔ cls-public between its own IRBs (same pattern as kube↔kube-cp) —
    the workers' fabric path to the Ceph RGW frontend. Hosts on the public
    VLAN reach the kube net back via `ip` (the ceph ansible adds that route).
  EOT
}

variable "cp_node_lags" {
  type        = map(list(string))
  default     = {}
  description = <<-EOT
    Control-plane node LACP bonds terminated on the core — same shape and rules as
    node_lags (key = ae name; value = the two member sub-ports, one per VC member,
    cabled to the SAME node), but the trunk carries the kube-cp VLAN instead of
    kube. Requires var.kube_cp. Members are 10G breakout legs (xe-…).
  EOT
}

variable "kube_cp" {
  type = object({
    vlan_id = number
    cidr    = string
  })
  default     = null
  description = <<-EOT
    Kubernetes control-plane network on the fabric: creates the kube-cp VLAN + its
    IRB (.1) on the spine — the second spine IRB, making the spine the router
    between kube (workers) and kube-cp (bare-metal CPs: etcd + the API VIP).
    null = no kube-cp VLAN.
  EOT
}

variable "node_bgp" {
  type = object({
    peer_range = string # the kube CIDR — nodes dynamic-peer from it; the IRB is its .1
    # Extra prefixes accepted from the nodes beyond the transit-advertised space —
    # e.g. the internal (NetBird-only) LoadBalancer VIP range.
    accept_prefixes = optional(list(string), [])
  })
  default     = null
  description = <<-EOT
    Set to enable Cilium node iBGP + the kube-VLAN IRB (north-south for LoadBalancer
    VIPs). irb.<kube_vlan> is the spine's only IRB — the VLAN-10 gateway (peer_range's .1)
    AND the iBGP peer address; nodes dynamic-peer from peer_range, so worker IPs aren't
    duplicated here. The core accepts what the transits already advertise (local.
    advertised) and reaches each LB VIP via its /32 next-hop; the concrete pool ranges
    live only in the Cilium LoadBalancerIPPools.
  EOT
}

variable "node_egress" {
  type        = map(string)
  default     = {}
  description = <<-EOT
    Worker internet egress via the fabric (the 40G transit instead of each node's 1 GbE
    eth0). Map of worker fabric IP => its public egress /32 in the advertised space. Each
    node SNATs its egress to that IP and default-routes via the core; this adds the /32
    return route so replies land on the right worker. The IP mapping lives here and in the
    node SNAT config (kubernetes/.../node-egress) — the two must agree.
  EOT
}

variable "sflow" {
  type = object({
    collector        = string # sflow-rt VIP (lb_internal range)
    agent_id         = string # stable agent identity (the lo0 host IP)
    udp_port         = optional(number, 6343)
    polling_interval = optional(number, 5)    # counter export cadence (seconds)
    sample_rate      = optional(number, 2048) # 1:N packet sampling
    interfaces       = list(string)           # PHYSICAL ports (sFlow can't attach to ae)
  })
  default     = null
  description = "sFlow export to the in-cluster sflow-rt collector — the seconds-granularity bandwidth source. See sflow.tf."
}

variable "mgmt_trusted_sources" {
  type        = list(string)
  default     = ["10.40.5.0/24", "10.254.0.0/15", "127.0.0.0/8"]
  description = "Source prefixes allowed to reach SSH/NETCONF on the RE (lo0 PROTECT-RE filter, applied when transit exists). OOB + NetBird mesh (this account assigns 10.254.0.0/15, NOT the 100.64/10 NetBird Cloud default) + loopback."
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
    See transit.tf — prepend maps to as_path_prepend, local_pref to local_preference.
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
