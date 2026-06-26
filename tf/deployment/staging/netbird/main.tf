# Per-environment NetBird (Cloud) groups, access policies, and device auth
# (setup) keys. One NetBird Cloud account backs every env; the module namespaces
# every object as "yucca_<env>_<name>" so they coexist.
#
# Auth (both injected by `op run --env-file=tf/.env` via the mise tf:* tasks):
#   • netbird     — admin PAT from NB_PAT (op://shared_tf/NETBIRD_TF_PAT).
#                   management_url defaults to https://api.netbird.io (Cloud).
#   • onepassword — OP_SERVICE_ACCOUNT_TOKEN (same op run session); writes the
#                   minted setup keys into the yucca_tf_<env> vault.
provider "netbird" {}
provider "onepassword" {}

# Existing NetBird groups owned outside this stack (the staging nodes live in the
# "Liberty Park" infra groups today). Looked up by name and handed to the module
# as external_groups so policies can reference them by logical key without
# managing them. The "yucca" users group is the global access group (see
# prod/global for the account-wide yucca→yucca policy).
data "netbird_group" "lp_compute" {
  name = "Liberty Park Compute"
}

data "netbird_group" "lp_server_monitoring" {
  name = "Liberty Park Server Monitoring"
}

data "netbird_group" "lp_servers" {
  name = "Liberty Park Servers"
}

data "netbird_group" "lp_services" {
  name = "Liberty Park Services"
}

module "netbird" {
  source = "../../../shared/modules/netbird-env"

  env         = var.env
  name_prefix = "yucca_${var.env}"
  vault       = "yucca_tf_${var.env}"

  groups     = var.groups
  setup_keys = var.setup_keys
  policies   = var.policies

  external_groups = {
    lp_compute           = data.netbird_group.lp_compute.id
    lp_server_monitoring = data.netbird_group.lp_server_monitoring.id
    lp_servers           = data.netbird_group.lp_servers.id
    lp_services          = data.netbird_group.lp_services.id
  }
}

output "group_ids" {
  description = "Logical group key → NetBird group ID."
  value       = module.netbird.group_ids
}

output "setup_key_items" {
  description = "Setup-key plaintext lives in these 1Password items (yucca_tf_<env>)."
  value       = module.netbird.setup_key_items
}
