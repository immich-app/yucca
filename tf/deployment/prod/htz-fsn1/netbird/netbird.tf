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
  # Routed subnets, exposed by the mgmt router peers. Addresses PROPAGATE from
  # fabric-addressing (addressing.tf), never hardcoded. Default tag "resources"
  # (resource=true) ⇒ yucca→resources policy governs access; resources are never
  # a policy source. kube-cp is deliberately NOT here — routed by its own network
  # below via the CPs. cls1 nets are tagged ceph_nets, NOT resources: the
  # talos-to-resources policy must not cover them — workers reach RGW via the
  # FABRIC, and a NetBird client route would shadow the machineconfig fabric
  # route (policy-routing table wins).
  routed = {
    mgmt = { address = module.addr_site.mgmt_cidr, description = "OOB / vme management network" }
    # Internal LB VIPs: peer → mgmt router → spine (iBGP /32) → worker; mgmt
    # hosts carry a static route for this range via the spine IRB (10.40.10.1).
    lb_internal    = { address = module.addr_site.lb_internal_cidr, description = "father internal LoadBalancer VIPs (netops UIs)" }
    kube           = { address = module.addr_site.kube_cidr, description = "Site-global kube node network (fabric)" }
    cls1_public    = { address = module.addr_cls1.public_cidr, description = "cls1 public cluster network", groups = ["ceph_nets"] }
    cls1_private   = { address = module.addr_cls1.private_cidr, description = "cls1 private cluster network", groups = ["ceph_nets"] }
    cls1_host_mgmt = { address = module.addr_cls1.host_mgmt_cidr, description = "cls1 host-management network", groups = ["ceph_nets"] }
  }

  netbird_networks = {
    "HTZ-FSN1" = {
      description = "htz-fsn1 site networks, routed via the mgmt nodes."
      router      = { peer_groups = ["mgmt"], masquerade = true }
      resources = {
        for name, r in local.routed : name => {
          address     = r.address
          description = r.description
          groups      = try(r.groups, ["resources"])
        }
      }
    }

    # kube-cp VLAN routed via CPs ONLY (talos_cp, the CP subset). Router must NOT
    # be the whole `talos` group: a routing peer doesn't install a client route
    # for its own network, so worker-as-router would never get the kube-cp mesh
    # route (worker→apiserver rides the fabric anyway). This is how operator/CI
    # peers reach the API VIP 10.40.11.5 + CPs; masquerade SNATs returns to the
    # CP's kube-cp address. CP/worker split is kept by the talos_cp vs talos
    # setup keys (netbird.auto.tfvars).
    "yucca-fsn-father-kube-cp" = {
      description = "father control-plane VLAN (kube-cp), routed via the CPs (talos_cp)."
      router      = { peer_groups = ["talos_cp"], masquerade = true }
      resources = {
        kube_cp = {
          address     = module.addr_site.kube_cp_cidr
          description = "kube-cp: bare-metal CPs (etcd) + the API VIP (10.40.11.5)."
          groups      = ["resources"]
        }
      }
    }
  }
}

# o11y prod mesh gateway group (owned by yucca-o11y's netbird TF) — destination
# of the talos-to-o11y-gateway policy; agents remote-write to
# vmauth.o11y.futo.network behind o11y's routing peers.
data "netbird_group" "o11y_k8s_gateway" {
  name = "o11y-production-k8s-gateway"
}

module "netbird" {
  source = "../../../../shared/modules/netbird-env"

  partition   = var.partition
  name_prefix = "yucca_${var.partition}_${var.region}" # yucca_prod_htz_fsn1 (slug normalized in the module)
  vault       = "yucca_tf_${var.partition}"            # yucca_tf_prod

  groups          = var.groups
  external_groups = { o11y_k8s_gateway = data.netbird_group.o11y_k8s_gateway.id }
  setup_keys      = var.setup_keys
  policies        = var.policies
  networks        = local.netbird_networks
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
