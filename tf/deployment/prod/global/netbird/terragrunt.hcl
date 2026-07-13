include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Global prod layer — account-wide resources shared across every prod site.
# Today: NetBird (netbird.tf). State key: yucca/prod/global/netbird/terraform.tfstate
# (n==3 named stack per the root's state_key rule; partition=prod, region=global).
# The stack manages nothing yet, so the fresh key is harmless — but if resources
# ever predate this comment fix at yucca/prod/global/terraform.tfstate, migrate
# that state before applying.
# netbird.auto.tfvars is loaded automatically; partition is injected by the root.
