include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# State key derives from the path: yucca/prod/htz-fsn1/fabric/terraform.tfstate
# Providers come from versions.tf (junos = jeremmfr/junos from the registry); the
# hetzner provider is supplied via a filesystem mirror (TF_CLI_CONFIG_FILE), set
# by the `infra:*` mise tasks and CI.
# terraform.auto.tfvars is loaded automatically.
