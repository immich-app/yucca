# Declarative inputs for one environment's NetBird footprint. Policies and
# setup keys reference groups by their LOGICAL key (the map key here), which the
# module resolves to the NetBird-assigned group ID — so the tfvars never carry
# opaque IDs.

variable "partition" {
  description = "Partition slug (dev|staging|prod). Labels the minted 1Password setup-key items."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for every NetBird object name so all envs/sites coexist in one NetBird Cloud account. Names render UPPER_SNAKE (uppercased, hyphens → underscores): e.g. \"yucca_staging\" → group \"YUCCA_STAGING_MGMT\"; \"yucca_prod_htz-fsn1\" → \"YUCCA_PROD_HTZ_FSN1_MGMT\"."
  type        = string
}

variable "vault" {
  description = "1Password vault that minted setup keys are written into (per env, e.g. \"yucca_tf_staging\")."
  type        = string
}

variable "groups" {
  description = "NetBird groups keyed by logical name. Groups start empty — membership comes from setup keys' auto_groups as peers register. Set `name` only to override the derived \"<NAME_PREFIX>_<KEY>\" (an override is normalized to UPPER_SNAKE too)."
  type = map(object({
    name = optional(string)
  }))
  default = {}
}

variable "external_groups" {
  description = "Groups owned by another layer/stack, exposed here as logical key → NetBird group ID so policies/setup keys/networks can reference them without re-managing them. Intended for cross-layer references (e.g. a prod site layer consuming a group from prod/global via a terragrunt dependency). Empty by default; keys must not collide with var.groups."
  type        = map(string)
  default     = {}

  validation {
    condition     = length(setintersection(keys(var.groups), keys(var.external_groups))) == 0
    error_message = "external_groups keys must not overlap var.groups keys (a logical key resolves to exactly one group)."
  }
}

variable "setup_keys" {
  description = "Device auth (setup) keys keyed by logical name. The plaintext key is written to 1Password (var.vault) as NETBIRD_<UPPERCASED_NAMESPACED_NAME>_SETUP_KEY and never surfaced in plan output."
  type = map(object({
    type                   = optional(string, "reusable") # "one-off" | "reusable"
    expiry_seconds         = optional(number, 0)          # 0 = no expiry
    usage_limit            = optional(number, 0)          # 0 = unlimited (reusable only)
    ephemeral              = optional(bool, false)        # peer auto-removed after ~10m idle
    revoked                = optional(bool, false)
    allow_extra_dns_labels = optional(bool, false)
    auto_groups            = optional(list(string), []) # logical group keys to auto-assign on join
  }))
  default = {}

  validation {
    condition     = alltrue([for k, s in var.setup_keys : contains(["one-off", "reusable"], s.type)])
    error_message = "setup_keys[*].type must be \"one-off\" or \"reusable\"."
  }

  validation {
    condition = alltrue(flatten([
      for k, s in var.setup_keys : [
        for g in s.auto_groups : contains(concat(keys(var.groups), keys(var.external_groups)), g)
      ]
    ]))
    error_message = "setup_keys[*].auto_groups must reference keys present in var.groups or var.external_groups."
  }
}

variable "policies" {
  description = "Access policies keyed by logical name. NetBird is default-deny; a rule's sources/destinations are logical group keys (resolved to NetBird group IDs)."
  type = map(object({
    description = optional(string)
    enabled     = optional(bool, true)
    rules = list(object({
      name          = string
      action        = optional(string, "accept") # "accept" | "drop"
      protocol      = optional(string, "all")    # tcp|udp|icmp|all
      bidirectional = optional(bool, true)
      enabled       = optional(bool, true)
      description   = optional(string)
      sources       = list(string)           # logical group keys
      destinations  = list(string)           # logical group keys
      ports         = optional(list(string)) # e.g. ["22","443"]; tcp/udp only
    }))
  }))
  default = {}

  validation {
    condition = alltrue(flatten([
      for k, p in var.policies : [
        for r in p.rules : [
          for g in concat(r.sources, r.destinations) : contains(concat(keys(var.groups), keys(var.external_groups)), g)
        ]
      ]
    ]))
    error_message = "policies[*].rules[*].sources/destinations must reference keys present in var.groups or var.external_groups."
  }
}

variable "networks" {
  description = "NetBird Networks keyed by logical name (the key is the Network's display name unless `name` is set — kept verbatim, not underscore-normalized). A Network routes its `resources` (subnets/hosts) through the peers in `router.peer_groups`; each resource's `groups` controls who may reach it. All group references are logical keys (var.groups or var.external_groups)."
  type = map(object({
    name        = optional(string)
    description = optional(string)
    router = object({
      peer_groups = list(string)           # logical group keys acting as routing peers
      masquerade  = optional(bool, true)   # SNAT overlay traffic to the route prefix
      metric      = optional(number, 9999) # lower = higher priority
      enabled     = optional(bool, true)
    })
    resources = optional(map(object({
      name        = optional(string) # default "<network_key>_<resource_key>" (normalized)
      address     = string           # CIDR (10.40.20.0/23), host (1.1.1.1), or domain
      description = optional(string)
      groups      = list(string) # logical group keys allowed to reach this resource
      enabled     = optional(bool, true)
    })), {})
  }))
  default = {}

  validation {
    condition = alltrue(flatten([
      for nk, n in var.networks : [
        [for g in n.router.peer_groups : contains(concat(keys(var.groups), keys(var.external_groups)), g)],
        [for rk, r in n.resources : [for g in r.groups : contains(concat(keys(var.groups), keys(var.external_groups)), g)]],
      ]
    ]))
    error_message = "networks[*].router.peer_groups and networks[*].resources[*].groups must reference keys present in var.groups or var.external_groups."
  }
}
