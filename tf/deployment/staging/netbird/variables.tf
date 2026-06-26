# Passthrough variables — shapes mirror the netbird-env module so the
# declarative netbird.auto.tfvars validates here before reaching the module.

variable "env" {
  description = "Environment slug, injected by terragrunt from the path (deployment/<env>/netbird)."
  type        = string
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
