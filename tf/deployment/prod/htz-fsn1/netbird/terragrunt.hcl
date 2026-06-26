# Include the deployment root DIRECTLY. This unit nests under prod/htz-fsn1/,
# which already has its own terragrunt.hcl (the fabric stack) — so the usual
# `find_in_parent_folders("terragrunt.hcl")` would resolve to THAT (the nearest
# ancestor), and since it also includes the root, terragrunt would see a
# two-level include chain ("only one level of includes is allowed"). Point at the
# root explicitly to skip the intervening fabric config.
include "root" {
  path = "${get_repo_root()}/tf/deployment/terragrunt.hcl"
}

# Site NetBird layer for htz-fsn1 — its own state, decoupled from the htz-fsn1
# fabric stack (state key: ceph/prod/htz-fsn1/netbird/terraform.tfstate, via the
# root's full-sub-path stack derivation).
#
# netbird.auto.tfvars is loaded automatically; `env` is injected by the root.

# Depends on the global layer for the shared "yucca_resource" tag — this site's
# routed network resources are tagged into it so the account-wide yucca→
# yucca_resource policy (prod/global) governs their access. prod/global must
# apply before this stack; mock_outputs cover validate/plan before that.
dependency "global" {
  config_path = "../../global"

  mock_outputs = {
    group_ids = { yucca_resource = "mock-yucca-resource-group-id" }
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  external_groups = {
    yucca_resource = dependency.global.outputs.group_ids.yucca_resource
  }
}
