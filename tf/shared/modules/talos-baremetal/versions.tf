terraform {
  required_version = "~> 1.11"
  required_providers {
    talos = {
      source  = "siderolabs/talos"
      version = "~> 0.11"
    }
    # Used by the node-names child module (random_shuffle) for hostname picks.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
