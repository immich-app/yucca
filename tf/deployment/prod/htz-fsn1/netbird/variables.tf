variable "partition" {
  description = "Partition slug, injected by terragrunt from the path (prod)."
  type        = string
}

variable "region" {
  description = "Region slug; namespaces this layer's NetBird objects as yucca-<partition>-<region>-*. Injected by terragrunt from the path (htz-fsn1)."
  type        = string
  default     = "htz-fsn1"
}

variable "stack" {
  description = "Stack name (netbird)."
  type        = string
  default     = null
}

variable "slug" {
  description = "Canonical <partition>-<region> slug (prod-htz-fsn1)."
  type        = string
  default     = null
}

variable "role" {
  description = "Region role: primary|secondary."
  type        = string
  default     = null
}

variable "datacenter" {
  description = "Datacenter segment of the region FQDN (fsn1)."
  type        = string
  default     = null
}

variable "provider_code" {
  description = "Provider segment of the region FQDN (htz)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Region FQDN suffix."
  type        = string
  default     = null
}

variable "groups" {
  type = map(object({
    name     = optional(string)
    resource = optional(bool, false)
  }))
  default = {}
}

variable "setup_keys" {
  type = map(object({
    type                   = optional(string, "reusable")
    expiry_seconds         = optional(number, 0)
    usage_limit            = optional(number, 0)
    ephemeral              = optional(bool, false)
    revoked                = optional(bool, false)
    allow_extra_dns_labels = optional(bool, false)
    auto_groups            = optional(list(string), [])
  }))
  default = {}
}

variable "policies" {
  type = map(object({
    description = optional(string)
    enabled     = optional(bool, true)
    rules = list(object({
      name          = string
      action        = optional(string, "accept")
      protocol      = optional(string, "all")
      bidirectional = optional(bool, true)
      enabled       = optional(bool, true)
      description   = optional(string)
      sources       = list(string)
      destinations  = list(string)
      ports         = optional(list(string))
    }))
  }))
  default = {}
}

variable "site_id" {
  description = "Site identifier feeding the fabric-addressing plan (htz-fsn1 = 40). Mirrors prod/htz-fsn1's site_id; the routed-network CIDRs derive from it, so nothing is hardcoded."
  type        = number
  default     = 40
}
