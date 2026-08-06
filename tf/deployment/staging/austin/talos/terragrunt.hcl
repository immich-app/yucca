include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# This stack talks straight to the bare-metal nodes — no extra inputs needed.
