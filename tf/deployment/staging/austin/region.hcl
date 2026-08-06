# Read by the root terragrunt via find_in_parent_folders("region.hcl") and
# merged into every stack's inputs.
locals {
  # primary | secondary. The primary region runs yucca-api + the database; only
  # relevant once a partition spans multiple regions (staging is single-region).
  role          = "primary"
  site_id       = null # austin is not a fabric-managed site (no switch fabric)
  datacenter    = "austin"
  provider_code = "int" # 3-letter provider segment of node hostnames
  region_code   = "aus" # 3-letter region segment of node hostnames
  domain        = "staging.austin.int.futo.cloud"
}
