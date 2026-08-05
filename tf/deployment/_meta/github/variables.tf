# Inputs injected by the root terragrunt.hcl (unused here, declared to satisfy it).
variable "partition" { type = string }
variable "region" { type = string }
variable "stack" { type = string }
variable "slug" { type = string }
variable "role" {
  type    = string
  default = null
}
variable "site_id" {
  type    = string
  default = null
}
variable "datacenter" {
  type    = string
  default = null
}
variable "provider_code" {
  type    = string
  default = null
}
variable "region_code" {
  type    = string
  default = null
}
variable "domain" {
  type    = string
  default = null
}

variable "github_owner" {
  description = "GitHub org/owner that owns the repository (e.g. immich-app)."
  type        = string
}

variable "repository" {
  description = "Repository name (without owner) whose Environments are managed here."
  type        = string
}

# NO default on purpose (see reviewers.auto.tfvars.example) and the validation
# rejects zero-reviewer environments — this keeps the CI gate fail-CLOSED.
variable "environment_reviewers" {
  description = <<-EOT
    Map of GitHub Environment name -> required reviewers. Keys MUST match the CI
    gate names the infra workflow references: staging-austin, staging-global,
    prod-global, prod-htz-fsn1. Every entry must list at least one team or user.
    IDs are numeric GitHub team IDs / user IDs (not slugs/logins).
  EOT
  type = map(object({
    team_ids = optional(list(number), [])
    user_ids = optional(list(number), [])
  }))

  validation {
    condition = alltrue([
      for env, r in var.environment_reviewers :
      (length(r.team_ids) + length(r.user_ids)) >= 1
    ])
    error_message = "Every environment in environment_reviewers must list at least one team or user reviewer (fail-closed approval gate)."
  }
}
