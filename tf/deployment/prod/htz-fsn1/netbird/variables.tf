variable "env" {
  description = "Environment slug, injected by terragrunt from the path (prod)."
  type        = string
}

variable "site" {
  description = "Site slug; namespaces this layer's NetBird objects as yucca-<env>-<site>-*."
  type        = string
  default     = "htz-fsn1"
}

variable "external_groups" {
  description = "Groups owned by the global prod layer, injected by the terragrunt dependency (logical key → NetBird group ID). Today: { admins = <global admins id> }."
  type        = map(string)
  default     = {}
}

variable "groups" {
  type = map(object({
    name = optional(string)
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
