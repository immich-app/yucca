# ─── Global prod NetBird layer ───────────────────────────────────────────────
# Account-wide groups, cross-site policies, and operator setup keys shared by
# every prod site. Site layers (prod/<site>/netbird) build on this — they pull
# this stack's `group_ids` output via a terragrunt dependency and grant the
# global `admins` group access to their site-local servers.
#
# One NetBird Cloud account backs all envs; objects here are namespaced
# "yucca-prod-*". Auth (both injected by `op run --env-file=tf/.env.prod`):
#   • netbird     — admin PAT from NB_PAT (op://shared_tf/NETBIRD_TF_PAT).
#   • onepassword — OP_SERVICE_ACCOUNT_TOKEN; writes setup keys to yucca_tf_prod.
provider "netbird" {}
provider "onepassword" {}

module "netbird" {
  source = "../../../shared/modules/netbird-env"

  env         = var.env
  name_prefix = "yucca_${var.env}"    # yucca_prod
  vault       = "yucca_tf_${var.env}" # yucca_tf_prod

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
