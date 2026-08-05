# ─── Global prod NetBird layer ───────────────────────────────────────────────
# Reserved for cross-site prod objects; empty today — everything lives in the
# site layers (prod/<site>/netbird). A cross-site group would be created here
# and consumed via the site layers' external_groups. Objects namespaced
# "yucca-prod-*". Auth via op run (tf/.env.prod): NB_PAT
# (op://shared_tf/NETBIRD_TF_PAT) + OP_SERVICE_ACCOUNT_TOKEN (→ yucca_tf_prod).
provider "netbird" {}
provider "onepassword" {}

module "netbird" {
  source = "../../../../shared/modules/netbird-env"

  partition   = var.partition
  name_prefix = "yucca_${var.partition}"    # yucca_prod
  vault       = "yucca_tf_${var.partition}" # yucca_tf_prod

  groups     = var.groups
  setup_keys = var.setup_keys
  policies   = var.policies
}

output "group_ids" {
  description = "Logical group key → NetBird group ID. Consumed by the prod site layers via terragrunt dependency."
  value       = module.netbird.group_ids
}

output "setup_key_items" {
  description = "Setup-key plaintext lives in these 1Password items (yucca_tf_prod)."
  value       = module.netbird.setup_key_items
}
