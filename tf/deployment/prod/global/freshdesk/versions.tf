terraform {
  required_version = "~> 1.11"
  required_providers {
    freshdesk = {
      source  = "registry.terraform.io/slop-place/freshdesk"
      version = "~> 0.1"
    }
    # Webhook path + header secret generation.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # Mirrors the generated credentials into 1P for the talos stack to consume.
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
