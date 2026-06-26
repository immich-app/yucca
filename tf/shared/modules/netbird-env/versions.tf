terraform {
  required_version = "~> 1.11"
  required_providers {
    # NetBird Cloud (api.netbird.io). The PAT is supplied to the *stack's*
    # provider block from NB_PAT (op://shared_tf/NETBIRD_TF_PAT); this module
    # only declares the dependency.
    netbird = {
      source  = "netbirdio/netbird"
      version = "~> 0.0.9"
    }
    # Writes minted setup keys into the per-env yucca_tf_<env> vault as the
    # source-of-truth record. Auth via OP_SERVICE_ACCOUNT_TOKEN (op run).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
