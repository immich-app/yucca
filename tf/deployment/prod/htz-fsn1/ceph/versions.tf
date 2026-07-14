terraform {
  required_version = ">= 1.6"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # This stack's secrets.tf creates the SPICE_CEPH_* password items in
    # yucca_tf_prod. Token via OP_SERVICE_ACCOUNT_TOKEN: infra.yml apply uses the
    # prod write SA OP_TF_YUCCA_PROD_ENV_WRITE; local runs use a superuser SA token.
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
