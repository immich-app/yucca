# ─── htz-fsn1 site NetBird layer ─────────────────────────────────────────────
# Site-local groups, setup keys, policies, and the routed "HTZ-FSN1" network for
# the FSN1 site. Objects are namespaced "yucca_prod_htz_fsn1_*".
#
# Auth (both injected by `op run --env-file=tf/.env.prod`):
#   • netbird     — admin PAT from NB_PAT (op://shared_tf/NETBIRD_TF_PAT).
#   • onepassword — OP_SERVICE_ACCOUNT_TOKEN; writes setup keys to yucca_tf_prod.
provider "netbird" {}
provider "onepassword" {}

locals {
  # Routed subnets for the HTZ-FSN1 Network. The mgmt nodes (router peers) expose
  # these to the overlay. ADDRESSES ARE PROPAGATED from the fabric-addressing plan
  # (addressing.tf) — not hardcoded — so the cluster definition stays the single
  # source of truth. `groups` (who may reach each subnet) comes from tfvars.
  routed = {
    mgmt         = { address = module.addr_site.mgmt_cidr, description = "OOB / vme management network" }
    api          = { address = module.addr_site.api_cidr, description = "Site-global API network" }
    cls1_public  = { address = module.addr_cls1.public_cidr, description = "cls1 public cluster network" }
    cls1_private = { address = module.addr_cls1.private_cidr, description = "cls1 private cluster network" }
  }

  netbird_networks = {
    "HTZ-FSN1" = {
      description = "htz-fsn1 site networks, routed via the mgmt nodes."
      router      = { peer_groups = ["mgmt"], masquerade = true }
      resources = {
        for name, r in local.routed : name => {
          address     = r.address
          description = r.description
          groups      = lookup(var.network_access, name, ["ci"])
        }
      }
    }
  }
}

module "netbird" {
  source = "../../../../shared/modules/netbird-env"

  env         = var.env
  name_prefix = "yucca_${var.env}_${var.site}" # yucca_prod_htz_fsn1 (slug normalized in the module)
  vault       = "yucca_tf_${var.env}"          # yucca_tf_prod

  groups          = var.groups
  setup_keys      = var.setup_keys
  policies        = var.policies
  networks        = local.netbird_networks
  external_groups = var.external_groups
}

output "group_ids" {
  description = "Logical group key → NetBird group ID (site-local groups)."
  value       = module.netbird.group_ids
}

output "setup_key_items" {
  description = "Setup-key plaintext lives in these 1Password items (yucca_tf_prod)."
  value       = module.netbird.setup_key_items
}

output "network_ids" {
  description = "Logical network key → NetBird network ID (e.g. HTZ-FSN1)."
  value       = module.netbird.network_ids
}
