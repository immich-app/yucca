include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# records.auto.tfvars is loaded automatically by OpenTofu in this directory.
# No stack-specific inputs.
