terraform {
  required_version = "~> 1.11"
  required_providers {
    # Community Junos provider; the stack passes a configured (aliased) instance.
    junos = {
      source  = "jeremmfr/junos"
      version = "~> 2.19"
    }
  }
}
