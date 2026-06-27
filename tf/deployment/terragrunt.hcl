# Root Terragrunt config — inherited by every stack below deployment/.
# Each child stack's terragrunt.hcl does:
#   include "root" { path = find_in_parent_folders() }
# which merges this config into the child.
#
# Responsibilities:
#   - Derive partition + region + stack (+ slug) from the directory path.
#   - Merge per-region metadata (role + FQDN parts) from the nearest region.hcl.
#   - State backend config (S3 against the shared yucca-tf-state bucket at OVH
#     Paris; key path yucca/<partition>/<region>/<stack>/).
#   - Common inputs.
#
# Providers are declared per-stack in their versions.tf — different stacks
# may need different provider sets (e.g., ceph uses 1P+local+random; the dns
# stack adds the cloudflare provider).

locals {
  # ── Partition / region / stack, parsed from the directory structure ──────
  #   tf/deployment/staging/austin/ceph        → partition=staging, region=austin,   stack=ceph
  #   tf/deployment/staging/global/dns         → partition=staging, region=global,   stack=dns
  #   tf/deployment/prod/htz-fsn1/fabric        → partition=prod,    region=htz-fsn1, stack=fabric
  #   tf/deployment/prod/htz-fsn1/netbird       → partition=prod,    region=htz-fsn1, stack=netbird
  #   tf/deployment/prod/global                 → partition=prod,    region=global,   stack=global  (n==2 fallback)
  #
  # `stack` is every segment after the region, joined — so a region can nest
  # sub-stacks (e.g. prod/htz-fsn1/netbird) each with their own state key. The
  # canonical slug `<partition>-<region>` derives names on other surfaces.
  relative_path = path_relative_to_include()
  segs          = split("/", local.relative_path)
  n             = length(local.segs)

  partition = local.n > 0 ? local.segs[0] : "unknown"
  region    = local.n > 1 ? local.segs[1] : "unknown"

  # stack = join(segs[2:]). n==2 fallback (region IS the stack) is a transition
  # guard for region-root stacks (prod/global) and pre-cutover flat layouts;
  # dead once every stack sits at 3 segments.
  stack = local.n > 2 ? join("/", slice(local.segs, 2, local.n)) : local.region

  slug = "${local.partition}-${local.region}"

  # State key. For n>=3, the full partition/region/stack path. For n==2 the
  # region already names the stack, so collapse to partition/region to avoid a
  # doubled `.../global/global/...` key.
  state_key = local.n > 2 ? "yucca/${local.partition}/${local.region}/${local.stack}/terraform.tfstate" : "yucca/${local.partition}/${local.region}/terraform.tfstate"

  # ── Per-region metadata (role + FQDN parts) from the nearest region.hcl ──
  # find_in_parent_folders with a fallback "" returns "" when no region.hcl is
  # present (transition guard) — then every field defaults to null.
  region_hcl_path = find_in_parent_folders("region.hcl", "")
  region_meta     = local.region_hcl_path != "" ? read_terragrunt_config(local.region_hcl_path).locals : {}

  role          = lookup(local.region_meta, "role", null)
  site_id       = lookup(local.region_meta, "site_id", null)
  datacenter    = lookup(local.region_meta, "datacenter", null)
  provider_code = lookup(local.region_meta, "provider_code", null)
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

    # OVH S3-compatible object storage (not AWS) — skip AWS-specific checks
    endpoints = {
      s3 = "https://s3.eu-west-par.io.cloud.ovh.net/"
    }
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    use_path_style              = true

    # State locking: deferred. use_lockfile = true requires the lockfile
    # to exist first, which fails the initial migration with a 404 on
    # GetObject. Enable after the first successful apply if multi-operator
    # races become a concern (single-operator today). OVH has no DynamoDB
    # equivalent so file-based locking is the only option.

    # Credentials injected as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
    # env vars via op run --env-file=tf/.env.
  }
}

inputs = {
  partition = local.partition
  region    = local.region
  stack     = local.stack
  slug      = local.slug

  # Region metadata (null in global regions / when no region.hcl exists yet).
  role          = local.role
  site_id       = local.site_id
  datacenter    = local.datacenter
  provider_code = local.provider_code
  domain        = local.domain
}
