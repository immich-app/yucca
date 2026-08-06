terraform {
  required_version = "~> 1.11"
  required_providers {
    talos = {
      source  = "siderolabs/talos"
      version = "~> 0.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    # Auth via OP_SERVICE_ACCOUNT_TOKEN.
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
