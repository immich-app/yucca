# fabric-netbox — build the NetBox representation of the fabric from scratch:
# the site, manufacturers/roles/device-types, the chassis devices (+ vme mgmt
# IPs), VLANs, prefixes, and gateway IPs — all derived from the addressing module
# and a device inventory. netbox provider (server_url + token) is configured by
# the stack. Split across site.tf / devices.tf / ipam.tf.

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

variable "mgmt_cidr" {
  type        = string
  description = "Management /24 (vme)."
}

variable "mgmt_prefixlen" {
  type        = number
  default     = 24
  description = "Prefix length for vme management IPs."
}

variable "clusters" {
  description = "Per-cluster networks (keyed by cluster ordinal as string)."
  type = map(object({
    cluster_supernet = string
    public_cidr      = string
    private_cidr     = string
    public_vlan_id   = number
    private_vlan_id  = number
    public_gateway   = string
    private_gateway  = string
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
