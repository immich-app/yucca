terraform {
  required_version = "~> 1.11"
  required_providers {
    # Only the local provider — this render writes files from static, public data
    # (addressing + identity). No backend, no secrets, no remote state.
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}
