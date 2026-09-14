variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "env" {
  description = "prod (main) or dev (pull-request previews)."
  type        = string
}

variable "stage" {
  description = "Empty on main; pr-<n> for a pull-request preview."
  type        = string
}

variable "pages_project" {
  description = "The environment's Pages project, from the project stack."
  type = object({
    id        = string
    name      = string
    subdomain = string
  })
}
