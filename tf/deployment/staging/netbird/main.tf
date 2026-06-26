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

# ─── In-cluster operator service account + API token ────────────────────
# The NetBird Kubernetes operator authenticates to the Management API with a
# personal access token. We mint a dedicated service user (auto-joined to the
# k8s_operator group) and a 365-day token, then stash the plaintext in the
# yucca_tf_staging vault — the staging/talos stack reads it from there (via
# TF_VAR) and bootstraps it into the netbird-mgmt-api-key Secret. The operator
# itself creates per-workload setup keys via this token, so no setup key is
# pre-provisioned for it.
#
# NB: NetBird PATs always expire — `tf:apply` past the expiry re-mints the token.
resource "netbird_user" "k8s_operator" {
  is_service_user = true
  name            = "yucca-${var.env}-k8s-operator"
  role            = "admin"
  auto_groups     = [module.netbird.group_ids["k8s_operator"]]
}

resource "netbird_token" "k8s_operator" {
  user_id         = netbird_user.k8s_operator.id
  name            = "yucca-${var.env}-k8s-operator"
  expiration_days = 365
}

data "onepassword_vault" "env" {
  name = "yucca_tf_${var.env}"
}

resource "onepassword_item" "k8s_operator_api_token" {
  vault    = data.onepassword_vault.env.uuid
  title    = upper("NETBIRD_YUCCA_${var.env}_K8S_OPERATOR_API_TOKEN")
  category = "password"
  password = netbird_token.k8s_operator.token

  section {
    label = "netbird"
    field {
      label = "token_id"
      type  = "STRING"
      value = netbird_token.k8s_operator.id
    }
    field {
      label = "service_user_id"
      type  = "STRING"
      value = netbird_user.k8s_operator.id
    }
    field {
      label = "expiration_date"
      type  = "STRING"
      value = netbird_token.k8s_operator.expiration_date
    }
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
