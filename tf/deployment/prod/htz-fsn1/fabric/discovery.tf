# ── Discovery contract ──────────────────────────────────────────────────────
# Single non-sensitive envelope consumed by yuctl (it parses
# .outputs.discovery.value straight from S3 state). Secrets are op:// refs only,
# never values — this stack has none. See tf/README.md "Discovery outputs".

output "discovery_schema_version" {
  description = "Schema version of the discovery output envelope."
  value       = 1
}

output "discovery" {
  description = "Topology + fabric payload for this stack (non-sensitive)."
  value = {
    schema_version = 1
    partition      = var.partition
    region         = var.region
    slug           = var.slug
    role           = var.role
    stack          = var.stack
    stack_type     = "fabric"
    region_meta = {
      site_id       = var.site_id
      datacenter    = var.datacenter
      provider_code = var.provider_code
      domain        = var.domain
    }
    fabric = {
      site_id   = var.site_id
      api_cidr  = module.addr_site.api_cidr
      mgmt_cidr = module.addr_site.mgmt_cidr
      cluster_cidrs = {
        cls1 = {
          public  = module.addr_cls1.public_cidr
          private = module.addr_cls1.private_cidr
        }
      }
    }
  }
}
