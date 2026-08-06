terraform {
  required_version = "~> 1.11"
  required_providers {
    # Static, public data (addressing + identity): no backend, no secrets, no
    # remote state.
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}
