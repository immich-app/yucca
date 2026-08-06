variable "site" {
  description = "The NetBox site to create."
  type = object({
    name        = string
    slug        = string
    code        = string # short code for VLAN names, e.g. FSN1 -> FSN1-C1-PUBLIC
    status      = optional(string, "active")
    description = optional(string, "")
  })
}

variable "site_supernet" {
  type        = string
  description = "Site /16 supernet (container prefix)."
}

variable "mgmt_prefixlen" {
  type        = number
  default     = 24
  description = "Prefix length for vme management IPs."
}

variable "global_vlans" {
  description = "Site-global VLANs present on every cluster (e.g. MGMT, API) -> vid + prefix."
  type = map(object({
    vid    = number
    prefix = string
  }))
  default = {}
}

variable "clusters" {
  description = "Per-cluster networks (keyed by cluster ordinal as string)."
  type = map(object({
    cluster_supernet  = string
    public_cidr       = string
    private_cidr      = string
    host_mgmt_cidr    = string
    public_vlan_id    = number
    private_vlan_id   = number
    host_mgmt_vlan_id = number
    public_gateway    = string
    private_gateway   = string
    host_mgmt_gateway = string
  }))
}

variable "devices" {
  description = <<-EOT
    The fabric chassis inventory, keyed by device name. Manufacturers, roles and
    device-types are derived from these. mgmt_ip (the VC vme) is set on the master
    chassis only (omit on the backup).
  EOT
  type = map(object({
    role         = string # spine | leaf | server
    manufacturer = string # e.g. "Juniper Networks"
    model        = string # e.g. "QFX5200-32C-32Q"
    serial       = optional(string)
    mgmt_ip      = optional(string) # vme host IP, e.g. 10.40.5.115 (master only)
  }))
}

variable "role_colors" {
  description = "color_hex per device role (NetBox requires one)."
  type        = map(string)
  default = {
    spine  = "2196f3"
    leaf   = "4caf50"
    server = "00bcd4"
  }
}

variable "extra_prefixes" {
  description = "Non-VLAN prefixes to register (cloud subnets, overlay/pod/service CIDRs, public space). Key = short name."
  type = map(object({
    prefix      = string
    description = string
    status      = optional(string, "active") # or "container"
  }))
  default = {}
}
