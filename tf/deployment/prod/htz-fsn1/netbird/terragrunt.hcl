# Region NetBird layer for htz-fsn1. The fabric stack now lives in its own
# `fabric/` sub-stack, so prod/htz-fsn1/ no longer carries a terragrunt.hcl —
# the usual `find_in_parent_folders("terragrunt.hcl")` resolves straight to the
# deployment root (no intervening config, no direct-include workaround).
include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Site NetBird layer for htz-fsn1 — its own state, decoupled from the htz-fsn1
# fabric stack (state key: yucca/prod/htz-fsn1/netbird/terraform.tfstate, via the
# root's full-sub-path stack derivation).
#
# netbird.auto.tfvars is loaded automatically; partition/region are injected by
# the root.
#
# This site owns its own resource group (the `resources` group in
# netbird.auto.tfvars, flagged `resource = true`): the netbird-env module tags
# the routed subnets into it and auto-generates the site's
# YUCCA_PROD_HTZ_FSN1_YUCCA_TO_RESOURCES policy. No dependency on prod/global —
# the former shared "yucca_resource" tag was retired.
