include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# clusters.auto.tfvars is loaded automatically by OpenTofu in this directory.
# State backend + env/stack (staging/talos) are derived by the root config.
# This stack talks straight to the bare-metal nodes — no extra inputs needed.
