# Addressing comes from fabric-addressing; aliased junos provider passed in by
# the stack.

variable "public_cidr" {
  type        = string
  description = "Cluster public network, e.g. 10.40.20.0/23."
}

variable "private_cidr" {
  type        = string
  description = "Cluster private network, e.g. 10.40.22.0/23."
}

variable "public_gateway" {
  type        = string
  description = "IRB gateway host (.1) for the public network."
}

variable "private_gateway" {
  type        = string
  description = "IRB gateway host (.1) for the private network."
}

variable "public_vlan_id" {
  type        = number
  description = "Public VLAN id (e.g. 120). VLAN name + IRB unit derive from it."
}

variable "private_vlan_id" {
  type        = number
  description = "Private VLAN id (e.g. 122). VLAN name + IRB unit derive from it."
}

variable "host_mgmt_cidr" {
  type        = string
  description = "Cluster host-management network, e.g. 10.40.24.0/24."
}

variable "host_mgmt_gateway" {
  type        = string
  description = "IRB gateway host (.1) for the host-management network."
}

variable "host_mgmt_vlan_id" {
  type        = number
  description = "Host-management VLAN id (e.g. 124). VLAN name + IRB unit derive from it."
}

variable "prefixlen" {
  type        = number
  default     = 23
  description = "Prefix length of the public/private networks."
}

variable "server_lag_count" {
  type        = number
  default     = 48
  description = "Number of server bonds. ae<k> = et-0/0/<k-1> + et-1/0/<k-1> (k=1..N)."
}

variable "uplink_ports" {
  type        = list(string)
  default     = ["et-0/0/54", "et-0/0/55", "et-1/0/54", "et-1/0/55"]
  description = "100G ports bonded into ae0 (the spine uplink)."
}

variable "vc_member_serials" {
  type        = list(string)
  description = "The leaf VC member chassis serials (member 0, member 1), for preprovisioned VC."
  validation {
    condition     = length(var.vc_member_serials) == 2
    error_message = "A cluster leaf is a pair: provide exactly two serials."
  }
}

variable "jumbo_mtu" {
  type        = number
  default     = 9216
  description = "Physical (L2) jumbo MTU for the spine uplink (ae0) and the server bonds (ae1..aeN)."
}

variable "private_irb_mtu" {
  type        = number
  default     = 9000
  description = "L3 (family inet) MTU of the private/cluster IRB gateway (VLAN 122), matching the Ceph hosts. Cluster-network only; the public (120) and host-mgmt (124) IRBs stay at the 1500 default by deliberate design."
}

variable "kube_vlan_id" {
  type        = number
  description = "Site-global kube VLAN id (carried on every cluster)."
}

variable "mgmt_vlan_id" {
  type        = number
  description = "Site-global management VLAN id (carried on every cluster)."
}
