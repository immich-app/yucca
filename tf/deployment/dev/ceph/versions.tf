terraform {
  required_version = ">= 1.6"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # onepassword provider re-enabled once a dedicated ceph-scoped 1P service
    # account replaces the org-wide superuser SA (per ADR-009).
    # Credentials via OP_SERVICE_ACCOUNT_TOKEN env var (injected by op run --env-file).
  }
}
