include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# State key derives from the path: ceph/prod/htz-fsn1/terraform.tfstate
# Providers come from versions.tf; the junos-qfx provider is supplied via
# dev_overrides (TF_CLI_CONFIG_FILE), set by the `fabric:*` mise tasks and CI.
# terraform.auto.tfvars is loaded automatically.
