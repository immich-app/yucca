variable "zone_id" {
  description = "Cloudflare zone ID for futo.cloud. Stable and non-secret; the API token in tf/.env.prod authorizes access to it."
  type        = string
}

variable "records" {
  description = "DNS records keyed by FQDN. Each entry fans out to one cloudflare_dns_record per value, so round-robin A records are N values under one name."
  type = map(object({
    type    = string
    values  = list(string)
    ttl     = optional(number, 300)
    proxied = optional(bool, false)
    comment = optional(string)
  }))

  validation {
    condition     = alltrue([for name, r in var.records : length(r.values) > 0])
    error_message = "Every record needs at least one value."
  }
}
