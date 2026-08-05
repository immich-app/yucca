include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Account-wide prod layer (NetBird). State key:
# yucca/prod/global/netbird/terraform.tfstate — if resources ever predate this
# at yucca/prod/global/terraform.tfstate, migrate that state before applying.
