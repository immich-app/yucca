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
    # secrets.tf creates SPICE_CEPH_* items in yucca_tf_prod. Token via
    # OP_SERVICE_ACCOUNT_TOKEN (CI: OP_TF_YUCCA_PROD_ENV_WRITE; local: superuser SA).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
