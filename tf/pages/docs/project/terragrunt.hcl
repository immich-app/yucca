include "root" {
  path   = find_in_parent_folders("terragrunt.hcl")
  expose = true
}

# One Pages project per environment, shared by every stage of it.
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = merge(include.root.locals.s3_config, {
    key = "yucca/pages/docs/project/${include.root.locals.env}/terraform.tfstate"
  })
}
