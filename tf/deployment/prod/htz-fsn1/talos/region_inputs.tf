# Injected by the root terragrunt from the directory path; region metadata
# (role + FQDN parts) is merged from the nearest region.hcl. Null defaults keep
# `tofu validate`/plan clean when a stack is run outside terragrunt.

variable "partition" {
  description = "Partition slug (prod|staging|dev), from deployment/<partition>/..."
  type        = string
  default     = null
}

variable "region" {
  description = "Region slug (austin|local|htz-fsn1|global)."
  type        = string
  default     = null
}

variable "stack" {
  description = "Stack name — every path segment after the region, joined."
  type        = string
  default     = null
}

variable "slug" {
  description = "Canonical <partition>-<region> slug."
  type        = string
  default     = null
}

variable "role" {
  description = "Region role: primary|secondary (null for global pseudo-regions)."
  type        = string
  default     = null
}

variable "site_id" {
  description = "Fabric site id (null for non-fabric / global regions). htz-fsn1 = 40."
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

variable "region_code" {
  description = "3-letter region segment of node hostnames (null for global)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Region FQDN suffix (null for global)."
  type        = string
  default     = null
}
