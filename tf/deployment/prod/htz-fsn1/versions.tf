terraform {
  required_version = "~> 1.11"
  required_providers {
    # JTAF-generated, vendored in tf/providers/terraform-provider-junos-qfx and
    # supplied via dev_overrides (see mise `fabric:provider-build` + the GH workflow).
    junos-qfx = {
      source = "hashicorp/junos-qfx"
    }
    netbox = {
      source  = "e-breuninger/netbox"
      version = "~> 4.0"
    }
  }
}
