terraform {
  required_version = "~> 1.11"
  required_providers {
    # PAT comes from the stack's provider block (NB_PAT, op://shared_tf/NETBIRD_TF_PAT).
    netbird = {
      # FUTO fork; only on the Terraform registry, so fully qualified (OpenTofu
      # would otherwise look on registry.opentofu.org).
      source  = "registry.terraform.io/futo-org/netbird"
      version = "1.0.2" # ≤1.0.1 can't update/delete groups with tagged resources; pin ≥1.0.2
    }
    # Writes minted setup keys to yucca_tf_<env>; auth via OP_SERVICE_ACCOUNT_TOKEN.
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
