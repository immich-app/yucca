# Auth via op run: netbird = NB_PAT (op://shared_tf/NETBIRD_TF_PAT);
# onepassword = OP_SERVICE_ACCOUNT_TOKEN, writes setup keys to yucca_tf_<env>.
provider "netbird" {}
provider "onepassword" {}

# Staging nodes live in the externally-owned "Liberty Park" infra groups —
# referenced unmanaged. Account-wide yucca→yucca policy: see prod/global.
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
  source = "../../../../shared/modules/netbird-env"

  partition   = var.partition
  name_prefix = "yucca_${var.partition}"
  vault       = "yucca_tf_${var.partition}"

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

# The staging/talos stack bootstraps this token into the netbird-mgmt-api-key
# Secret; the in-cluster operator mints its own setup keys with it. PATs always
# expire — `tf:apply` past expiry re-mints.
resource "netbird_user" "k8s_operator" {
  is_service_user = true
  name            = "yucca-${var.partition}-k8s-operator"
  role            = "admin"
  auto_groups     = [module.netbird.group_ids["k8s_operator"]]
}

resource "netbird_token" "k8s_operator" {
  user_id         = netbird_user.k8s_operator.id
  name            = "yucca-${var.partition}-k8s-operator"
  expiration_days = 365
}

data "onepassword_vault" "env" {
  name = "yucca_tf_${var.partition}"
}

resource "onepassword_item" "k8s_operator_api_token" {
  vault    = data.onepassword_vault.env.uuid
  title    = upper("NETBIRD_YUCCA_${var.partition}_K8S_OPERATOR_API_TOKEN")
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
