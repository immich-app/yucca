# Root Terragrunt config — inherited by every stack below deployment/.
# Each child stack's terragrunt.hcl does:
#   include "root" { path = find_in_parent_folders() }
# which merges this config into the child.
#
# Responsibilities:
#   - Derive env + stack from directory path.
#   - State backend config (S3 against the shared yucca-tf-state bucket
#     at OVH Paris; key path is project-scoped to ceph/<env>/<stack>/).
#   - Common inputs.
#
# Providers are declared per-stack in their versions.tf — different stacks
# may need different provider sets (e.g., ceph uses 1P+local+random; a future
# Hetzner-dns stack might add the hetzner provider).

locals {
  # Parse env and stack from the directory structure.
  #   tf/deployment/dev/ceph            → env=dev,  stack=ceph
  #   tf/deployment/prod/htz-fsn1       → env=prod, stack=htz-fsn1
  #   tf/deployment/prod/htz-fsn1/netbird → env=prod, stack=htz-fsn1/netbird
  # `stack` is EVERY segment after env, joined — so a site can nest sub-stacks
  # (e.g. prod/<site>/netbird) with their own state key, distinct from the site's
  # top-level stack. Single-segment stacks are unchanged (slice of [1:1] = the
  # one element), so existing state keys are preserved.
  relative_path = path_relative_to_include()
  path_segments = split("/", local.relative_path)
  env           = length(local.path_segments) > 0 ? local.path_segments[0] : "unknown"
  stack = length(local.path_segments) > 1 ? join("/", slice(
    local.path_segments, 1, length(local.path_segments)
  )) : "unknown"
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket = "yucca-tf-state"
    key    = "ceph/${local.env}/${local.stack}/terraform.tfstate"
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
  env   = local.env
  stack = local.stack
}
