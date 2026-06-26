# Per-environment NetBird (Cloud) groups, access policies, and device auth
# (setup) keys. One NetBird Cloud account backs all three envs; the module
# namespaces every object as "yucca-<env>-<name>" so they coexist.
#
# Auth (both injected by `op run --env-file=tf/.env` via the mise tf:* tasks):
#   • netbird     — admin PAT from NB_PAT (op://shared_tf/NETBIRD_TF_PAT).
#                   management_url defaults to https://api.netbird.io (Cloud).
#   • onepassword — OP_SERVICE_ACCOUNT_TOKEN (same op run session); writes the
#                   minted setup keys into the yucca_tf_<env> vault.
provider "netbird" {}
provider "onepassword" {}

module "netbird" {
  source = "../../../shared/modules/netbird-env"

  env         = var.env
  name_prefix = "yucca_${var.env}"
  vault       = "yucca_tf_${var.env}"

  groups     = var.groups
  setup_keys = var.setup_keys
  policies   = var.policies
}

output "group_ids" {
  description = "Logical group key → NetBird group ID."
  value       = module.netbird.group_ids
}

output "setup_key_items" {
  description = "Setup-key plaintext lives in these 1Password items (yucca_tf_<env>)."
  value       = module.netbird.setup_key_items
}
