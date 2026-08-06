locals {
  relative_path = path_relative_to_include()
  segs          = split("/", local.relative_path)
  n             = length(local.segs)

  partition = local.n > 0 ? local.segs[0] : "unknown"
  region    = local.n > 1 ? local.segs[1] : "unknown"

  # n==2 fallback (region IS the stack): transition guard for region-root stacks;
  # dead once every stack sits at 3 segments.
  stack = local.n > 2 ? join("/", slice(local.segs, 2, local.n)) : local.region

  slug = "${local.partition}-${local.region}"

  # n==2 collapses to partition/region to avoid a doubled `.../global/global/...` key.
  state_key = local.n > 2 ? "yucca/${local.partition}/${local.region}/${local.stack}/terraform.tfstate" : "yucca/${local.partition}/${local.region}/terraform.tfstate"

  region_hcl_path = find_in_parent_folders("region.hcl", "")
  region_meta     = local.region_hcl_path != "" ? read_terragrunt_config(local.region_hcl_path).locals : {}

  role          = lookup(local.region_meta, "role", null)
  site_id       = lookup(local.region_meta, "site_id", null)
  datacenter    = lookup(local.region_meta, "datacenter", null)
  provider_code = lookup(local.region_meta, "provider_code", null)
  region_code   = lookup(local.region_meta, "region_code", null)
  domain        = lookup(local.region_meta, "domain", null)
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket = "yucca-tf-state"
    key    = local.state_key
    region = "eu-west-par"

    endpoints = {
      s3 = "https://s3.eu-west-par.io.cloud.ovh.net/"
    }
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    use_path_style              = true

    # Locking deferred: use_lockfile=true 404s on initial migration (lockfile
    # must pre-exist); OVH has no DynamoDB, file locking is the only option.
    # Credentials via AWS_ACCESS_KEY_ID/SECRET env from op run --env-file=tf/.env.
  }
}

inputs = {
  partition = local.partition
  region    = local.region
  stack     = local.stack
  slug      = local.slug

  role          = local.role
  site_id       = local.site_id
  datacenter    = local.datacenter
  provider_code = local.provider_code
  region_code   = local.region_code
  domain        = local.domain
}
