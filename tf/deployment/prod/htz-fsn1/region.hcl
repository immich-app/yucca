# Per-region metadata for prod@htz-fsn1 (Hetzner Falkenstein, fabric site 40).
locals {
  role          = "primary"
  site_id       = 40
  datacenter    = "fsn1"
  provider_code = "htz" # 3-letter provider segment of node hostnames
  region_code   = "fsn" # 3-letter region segment of node hostnames
  domain        = "prod.fsn1.htz.futo.cloud"
}
