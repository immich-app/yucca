# Cloudflare Pages sites. Outside tf/deployment so the infra workflow's stack
# discovery leaves these to the site's own workflow (.github/workflows/docs.yml).

locals {
  env   = get_env("TF_VAR_env")
  stage = get_env("TF_VAR_stage", "")

  s3_config = {
    bucket = "yucca-tf-state"
    region = "eu-west-par"
    endpoints = {
      s3 = "https://s3.eu-west-par.io.cloud.ovh.net/"
    }
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    use_path_style              = true
  }
}

inputs = {
  env   = local.env
  stage = local.stage
}
