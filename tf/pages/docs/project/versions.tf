terraform {
  required_version = "~> 1.11"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "4.52.8"
    }
  }
}
