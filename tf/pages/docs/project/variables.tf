variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "env" {
  description = "prod (main) or dev (pull-request previews); names the Pages project."
  type        = string
}
