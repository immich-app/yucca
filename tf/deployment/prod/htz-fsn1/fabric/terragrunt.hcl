include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# State key derives from the path: yucca/prod/htz-fsn1/fabric/terraform.tfstate
# The hetzner provider is supplied via a filesystem mirror (TF_CLI_CONFIG_FILE),
# set by the `infra:*` mise tasks and CI.
