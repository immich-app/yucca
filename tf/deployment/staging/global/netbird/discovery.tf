# ── Discovery contract ──────────────────────────────────────────────────────
# Single non-sensitive envelope consumed by yuctl. Secrets stay in 1P; the
# setup-key plaintext is never output — only the item titles. See tf/README.md.

output "discovery_schema_version" {
  description = "Schema version of the discovery output envelope."
  value       = 1
}

output "discovery" {
  description = "Topology + netbird payload for this stack (non-sensitive)."
  value = {
    schema_version = 1
    partition      = var.partition
    region         = var.region
    slug           = var.slug
    role           = var.role
    stack          = var.stack
    stack_type     = "netbird"
    region_meta = {
      site_id       = var.site_id
      datacenter    = var.datacenter
      provider_code = var.provider_code
      domain        = var.domain
    }
    netbird = {
      name_prefix           = "yucca_${var.partition}"
      vault                 = "yucca_tf_${var.partition}"
      group_ids             = module.netbird.group_ids
      policy_ids            = module.netbird.policy_ids
      network_ids           = module.netbird.network_ids
      setup_key_item_titles = module.netbird.setup_key_items
    }
  }
}
