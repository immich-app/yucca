include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# netbird.auto.tfvars is loaded automatically by OpenTofu in this directory.
# `env` is injected by the root config (parsed from the path: deployment/<env>/netbird).
