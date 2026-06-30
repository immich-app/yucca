terraform {
  required_version = "~> 1.11"
  required_providers {
    # NetBird Cloud (api.netbird.io). The PAT is supplied to the *stack's*
    # provider block from NB_PAT (op://shared_tf/NETBIRD_TF_PAT); this module
    # only declares the dependency.
    netbird = {
      # FUTO-maintained fork (github.com/futo-org/terraform-provider-netbird).
      # Only published to the Terraform registry, so the source is fully
      # qualified — OpenTofu would otherwise look it up on registry.opentofu.org.
      source  = "registry.terraform.io/futo-org/netbird"
      version = "~> 1.0"
    }
    # Writes minted setup keys into the per-env yucca_tf_<env> vault as the
    # source-of-truth record. Auth via OP_SERVICE_ACCOUNT_TOKEN (op run).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
