# Per-region metadata for staging@austin. Read by the root terragrunt via
# find_in_parent_folders("region.hcl") and merged into every stack's inputs,
# so each stack inherits role + FQDN parts without per-tfvars duplication.
locals {
  # primary | secondary. The primary region runs yucca-api + the database; only
  # relevant once a partition spans multiple regions (staging is single-region).
  role          = "primary"
  site_id       = null # austin is not a fabric-managed site (no switch fabric)
  datacenter    = "austin"
  provider_code = "int"
  domain        = "staging.austin.int.futo.cloud"
}
