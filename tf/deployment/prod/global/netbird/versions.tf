terraform {
  required_version = "~> 1.11"
  required_providers {
    netbird = {
      source  = "registry.terraform.io/futo-org/netbird"
      version = "1.0.2"
    }
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
