# Passthrough variables — shapes mirror the netbird-env module so the
# declarative netbird.auto.tfvars validates here before reaching the module.

variable "partition" {
  description = "Partition slug, injected by terragrunt from the path (deployment/<partition>/<region>/netbird)."
  type        = string
}

variable "region" {
  description = "Region slug (global for the partition-wide netbird stack)."
  type        = string
  default     = null
}

variable "stack" {
  description = "Stack name (netbird)."
  type        = string
  default     = null
}

variable "slug" {
  description = "Canonical <partition>-<region> slug."
  type        = string
  default     = null
}

variable "role" {
  description = "Region role (null for the global pseudo-region)."
  type        = string
  default     = null
}

variable "site_id" {
  description = "Fabric site id (null for global)."
  type        = number
  default     = null
}

variable "datacenter" {
  description = "Datacenter segment of the region FQDN (null for global)."
  type        = string
  default     = null
}

variable "provider_code" {
  description = "Provider segment of the region FQDN (null for global)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Region FQDN suffix (null for global)."
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
