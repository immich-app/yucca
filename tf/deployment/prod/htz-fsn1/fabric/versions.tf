terraform {
  required_version = "~> 1.11"
  required_providers {
    junos = {
      source  = "jeremmfr/junos"
      version = "~> 2.19"
    }
    netbox = {
      source  = "e-breuninger/netbox"
      version = "~> 4.0"
    }
    # The only non-registry provider: built locally + supplied via a filesystem
    # mirror (mise `mgmt:provider-build`, invoked by `infra:providers`).
    hetzner = {
      source = "zack/hetzner"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    # Auth via OP_SERVICE_ACCOUNT_TOKEN (infra:* tasks escalate to the write SA).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
