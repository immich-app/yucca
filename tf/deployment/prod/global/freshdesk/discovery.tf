# ── Discovery contract ──────────────────────────────────────────────────────
# Single non-sensitive envelope consumed by yuctl. The credential values stay
# in 1P — only the item titles are output. See tf/README.md.

output "discovery_schema_version" {
  description = "Schema version of the discovery output envelope."
  value       = 1
}

output "discovery" {
  description = "Freshdesk payload for this partition (non-sensitive)."
  value = {
    schema_version = 1
    partition      = var.partition
    region         = var.region
    slug           = var.slug
    role           = var.role
    stack          = var.stack
    stack_type     = "freshdesk"
    freshdesk = {
      vault        = "yucca_tf_${var.partition}"
      group_name   = "FUTO Cloud"
      rule_managed = nonsensitive(local.enabled)
      item_titles = {
        webhook_path   = "YUCCA_FRESHDESK_WEBHOOK_PATH"
        webhook_secret = "YUCCA_FRESHDESK_WEBHOOK_SECRET"
        group_id       = "YUCCA_FRESHDESK_GROUP_ID"
      }
    }
  }
}
