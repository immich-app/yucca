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
    # The only non-registry provider: built locally + supplied via a filesystem
    # mirror (mise `mgmt:provider-build`, invoked by `infra:providers`).
    hetzner = {
      source = "zack/hetzner"
    }
    # Generates the mgmt-host provisioning keypair (mgmt.tf).
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    # Stores the provisioning key in 1P; auth via OP_SERVICE_ACCOUNT_TOKEN
    # (infra:* tasks escalate to the write SA).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
  }
}
