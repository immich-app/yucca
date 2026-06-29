terraform {
  required_version = "~> 1.11"
  required_providers {
    # Community Junos provider (typed per-resource CRUD) from the registry.
    junos = {
      source  = "jeremmfr/junos"
      version = "~> 2.19"
    }
    netbox = {
      source  = "e-breuninger/netbox"
      version = "~> 4.0"
    }
    # Hetzner Robot (dedicated-server) API — mgmt-host reprovisioning (mgmt.tf).
    # Built locally + supplied via the same filesystem_mirror as junos-qfx
    # (mise `mgmt:provider-build`, invoked by `infra:providers`).
    hetzner = {
      source = "zack/hetzner"
    }
    # Generates the mgmt-host provisioning keypair (mgmt.tf).
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    # Stores the generated provisioning key in 1Password (the env vault). Auth via
    # the service-account token in OP_SERVICE_ACCOUNT_TOKEN (apply escalates to the
    # write-capable SA stored in the vault; see the `infra:*` mise tasks).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
