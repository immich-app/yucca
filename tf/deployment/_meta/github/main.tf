# --- GitHub approval-gate Environments (managed as code) ---------------------
# infra.yml gates applies behind `environment: <partition>-<region>`; GitHub
# auto-creates referenced Environments with NO protection, so the gate fails
# OPEN for new regions — declaring them here with reviewers closes that (the
# discover job also asserts a reviewer exists). Auth: GITHUB_TOKEN from the env
# (Environments:write; NOT in tf/.env*); state backend still needs the OVH creds.
provider "github" {
  owner = var.github_owner
}

resource "github_repository_environment" "gate" {
  for_each    = var.environment_reviewers
  repository  = var.repository
  environment = each.key

  reviewers {
    teams = each.value.team_ids
    users = each.value.user_ids
  }

  # Only protected branches (main) may deploy to these gated Environments.
  deployment_branch_policy {
    protected_branches     = true
    custom_branch_policies = false
  }
}

output "managed_environments" {
  description = "Environment names managed by this stack."
  value       = sort(keys(github_repository_environment.gate))
}
