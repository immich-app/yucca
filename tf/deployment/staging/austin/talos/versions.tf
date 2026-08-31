terraform {
  required_version = "~> 1.11"
  required_providers {
    talos = {
      source  = "siderolabs/talos"
      version = "~> 0.11"
    }
    # Hostname picks for the talos nodes (node-names module → random_shuffle).
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # TRANSITIONAL: no freshdesk resources remain in config — the declaration
    # only lets tofu destroy the state-held group/rule from the pre-
    # global/freshdesk layout. Remove together with the provider block and
    # yucca_freshdesk_admin_api_key after one apply.
    freshdesk = {
      source  = "registry.terraform.io/slop-place/freshdesk"
      version = "~> 0.1"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
    # Generates the ES256 JWT keypair (yucca-api signs, michael verifies).
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    # Writes the generated keypair into 1Password (yucca_tf_staging) as the
    # source-of-truth record. Auth via OP_SERVICE_ACCOUNT_TOKEN (op run).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
