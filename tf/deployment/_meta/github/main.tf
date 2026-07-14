# --- GitHub approval-gate Environments (managed as code) ---------------------
# The infra workflow gates every apply behind `environment: <partition>-<region>`.
# GitHub auto-creates a referenced Environment with NO protection rules, so the
# gate would fail OPEN for any newly-added region. Declaring the Environments here
# WITH required reviewers closes that hole; the discover job additionally asserts
# each one carries a reviewer before planning (defense in depth).
#
# Auth: the github provider reads GITHUB_TOKEN from the environment (a repo-admin
# / Environments:write PAT or GitHub App token -- supply it out-of-band; it is not
# in tf/.env*). The S3 state backend still needs the OVH creds from tf/.env(.prod).
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
