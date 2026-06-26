include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Global prod layer — account-wide resources shared across every prod site.
# Today: NetBird (netbird.tf). State key: ceph/prod/global/terraform.tfstate.
# netbird.auto.tfvars is loaded automatically; `env` is injected by the root.
