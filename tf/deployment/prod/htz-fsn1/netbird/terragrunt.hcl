# prod/htz-fsn1/ has no terragrunt.hcl, so find_in_parent_folders resolves
# straight to the deployment root.
include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# The site owns its `resources` group (netbird.auto.tfvars, resource = true) —
# the module tags
# routed subnets into it and auto-generates YUCCA_PROD_HTZ_FSN1_YUCCA_TO_RESOURCES.
# No dependency on prod/global (shared "yucca_resource" tag retired).
