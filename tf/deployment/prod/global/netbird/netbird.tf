# ─── Global prod NetBird layer ───────────────────────────────────────────────
# Reserved for ACCOUNT-WIDE / cross-site prod NetBird objects (groups or policies
# that span every prod site). Empty today — with per-site resource groups and the
# module-generated yucca→resources policy (see netbird-env), all current prod
# objects live in the site layers (prod/<site>/netbird). A cross-site group would
# be created here and consumed by site layers via their `external_groups` input.
#
# One NetBird Cloud account backs all envs; objects here are namespaced
# "yucca-prod-*". Auth (both injected by `op run --env-file=tf/.env.prod`):
#   • netbird     — admin PAT from NB_PAT (op://shared_tf/NETBIRD_TF_PAT).
#   • onepassword — OP_SERVICE_ACCOUNT_TOKEN; writes setup keys to yucca_tf_prod.
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
