# --- Discovery contract ------------------------------------------------------
# Single non-sensitive envelope consumed by yuctl. The Cloudflare API token is
# an op:// reference only, never a value. See tf/README.md "Discovery outputs".

output "discovery_schema_version" {
  description = "Schema version of the discovery output envelope."
  value       = 1
}

output "discovery" {
  description = "Topology + dns payload for this stack (non-sensitive)."
  value = {
    schema_version = 1
    partition      = var.partition
    region         = var.region
    slug           = var.slug
    role           = var.role
    stack          = var.stack
    stack_type     = "dns"
    region_meta = {
      site_id       = var.site_id
      datacenter    = var.datacenter
      provider_code = var.provider_code
      domain        = var.domain
    }
    dns = {
      provider      = "cloudflare"
      zone          = "futo.cloud"
      record_fqdns  = keys(var.records)
      api_token_ref = "op://yucca_tf_${var.partition}/CLOUDFLARE_API_TOKEN/password"
    }
  }
}
