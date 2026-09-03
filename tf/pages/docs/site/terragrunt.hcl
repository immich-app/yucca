include "root" {
  path   = find_in_parent_folders("terragrunt.hcl")
  expose = true
}

dependency "project" {
  config_path = "../project"

  mock_outputs = {
    pages_project = {
      id        = "mock"
      name      = "docs-futo-cloud-mock"
      subdomain = "docs-futo-cloud-mock.pages.dev"
    }
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  pages_project = dependency.project.outputs.pages_project
}

# One custom domain per stage (main, or a pr-<n> preview).
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = merge(include.root.locals.s3_config, {
    key = "yucca/pages/docs/site/${include.root.locals.env}/${include.root.locals.stage == "" ? "main" : include.root.locals.stage}/terraform.tfstate"
  })
}
