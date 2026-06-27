# Region NetBird layer for htz-fsn1. The fabric stack now lives in its own
# `fabric/` sub-stack, so prod/htz-fsn1/ no longer carries a terragrunt.hcl —
# the usual `find_in_parent_folders("terragrunt.hcl")` resolves straight to the
# deployment root (no intervening config, no direct-include workaround).
include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Site NetBird layer for htz-fsn1 — its own state, decoupled from the htz-fsn1
# fabric stack (state key: yucca/prod/htz-fsn1/netbird/terraform.tfstate, via the
# root's full-sub-path stack derivation).
#
# netbird.auto.tfvars is loaded automatically; partition/region are injected by
# the root.

# Depends on the global layer for the shared "yucca_resource" tag — this site's
# routed network resources are tagged into it so the account-wide yucca→
# yucca_resource policy (prod/global) governs their access. prod/global must
# apply before this stack; mock_outputs cover validate/plan before that.
dependency "global" {
  config_path = "../../global/netbird"

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
