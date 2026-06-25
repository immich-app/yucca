terraform {
  required_version = "~> 1.11"
  required_providers {
    junos-qfx = {
      # JTAF-generated provider, vendored in tf/providers/terraform-provider-junos-qfx
      # and supplied via dev_overrides / a filesystem mirror. The stack passes a
      # configured (aliased) instance into this module.
      source = "hashicorp/junos-qfx"
    }
  }
}
