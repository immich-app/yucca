provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

module "pages_project" {
  source = "git::https://github.com/immich-app/devtools.git//tf/shared/modules/cloudflare-pages-project?ref=main"

  cloudflare_api_token  = var.cloudflare_api_token
  cloudflare_account_id = var.cloudflare_account_id

  app_name = "docs"
  domain   = "futo.cloud"
  env      = var.env
}

output "pages_project" {
  value = module.pages_project.pages_project
}
