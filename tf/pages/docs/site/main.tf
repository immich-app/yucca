provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

module "site" {
  source = "git::https://github.com/immich-app/devtools.git//tf/shared/modules/cloudflare-pages?ref=main"

  cloudflare_api_token  = var.cloudflare_api_token
  cloudflare_account_id = var.cloudflare_account_id
  pages_project         = var.pages_project

  app_name = "docs"
  domain   = "futo.cloud"
  env      = var.env
  stage    = var.stage
}

output "pages_project_name" {
  value = module.site.pages_project_name
}

output "pages_branch" {
  description = "The Pages branch wrangler uploads to: prod on main, pr-<n>dev for a preview."
  value       = module.site.pages_branch
}

output "hostname" {
  description = "The custom domain serving this stage."
  value       = module.site.branch_subdomain
}

output "pages_hostname" {
  description = "The *.pages.dev hostname the custom domain points at."
  value       = module.site.pages_branch_subdomain
}
