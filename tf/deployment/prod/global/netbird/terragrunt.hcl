include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Global prod layer — account-wide resources shared across every prod site.
# Today: NetBird (netbird.tf). State key: yucca/prod/global/terraform.tfstate
# (n==2 region-root stack; partition=prod, region=global).
# netbird.auto.tfvars is loaded automatically; partition is injected by the root.
