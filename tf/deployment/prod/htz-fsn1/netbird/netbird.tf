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
  # source of truth. Every resource is tagged into this site's own "resources"
  # group (flagged `resource = true` in netbird.auto.tfvars), so the module-
  # generated yucca→resources policy governs access — and resources never appear
  # as a policy source, so they can't reach each other.
  # NB: the `kube-cp` network (the routed Hetzner Cloud Network for the cloud
  # control-plane VMs) is deliberately NOT advertised here. The router peers are the
  # mgmt nodes, which sit on the Juniper fabric and cannot reach the hcloud subnets.
  # The CP plane is reached out-of-band via hcloud public IPs + the API LB's public
  # frontend (both firewalled to the NetBird/operator ranges) — see the talos stack.
  # TODO(prod): for a fully-private control plane, attach the mgmt nodes to the
  # kube-cp vSwitch and add module.addr_site.kube_cp_cidr to this map.
  routed = {
    mgmt = { address = module.addr_site.mgmt_cidr, description = "OOB / vme management network" }
    # Internal LB VIPs (Grafana + netops UIs): NetBird peer -> mgmt router -> spine
    # (iBGP /32 from the workers) -> worker. The mgmt hosts carry a static route for
    # this range via the spine IRB (10.40.10.1).
    lb_internal    = { address = module.addr_site.lb_internal_cidr, description = "father internal LoadBalancer VIPs (netops UIs)" }
    kube           = { address = module.addr_site.kube_cidr, description = "Site-global kube node network (fabric)" }
    cls1_public    = { address = module.addr_cls1.public_cidr, description = "cls1 public cluster network" }
    cls1_private   = { address = module.addr_cls1.private_cidr, description = "cls1 private cluster network" }
    cls1_host_mgmt = { address = module.addr_cls1.host_mgmt_cidr, description = "cls1 host-management network" }
  }

  netbird_networks = {
    "HTZ-FSN1" = {
      description = "htz-fsn1 site networks, routed via the mgmt nodes."
      router      = { peer_groups = ["mgmt"], masquerade = true }
      resources = {
        for name, r in local.routed : name => {
          address     = r.address
          description = r.description
          groups      = ["resources"]
        }
      }
    }

    # father's cloud control-plane subnet (kube-cp), routed via the CPs ONLY (the
    # talos_cp group — the CP-only subset of talos). They're the only peers on that
    # hcloud subnet. Router must NOT be the whole `talos` group: the bare-metal workers
    # are also `talos`, and a routing peer doesn't install a client route for its own
    # network — so if the workers were routers they'd never get the kube-cp route (and
    # their pods couldn't reach the apiserver). This is how NetBird peers (operators +
    # workers) reach the private API LB (10.40.11.5) + the CPs. masquerade so return
    # traffic is SNAT'd to the CP's kube-cp address.
    # CP membership comes from the talos_cp setup key (netbird.auto.tfvars, auto_groups
    # [talos, talos_cp]); the talos stack joins CPs with it and workers with the plain
    # `talos` key, so re-provisioning keeps the split.
    "yucca-fsn-father-kube-cp" = {
      description = "father control-plane subnet (kube-cp), routed via the CPs (talos_cp)."
      router      = { peer_groups = ["talos_cp"], masquerade = true }
      resources = {
        kube_cp = {
          address     = module.addr_site.kube_cp_cidr
          description = "kube-cp: CP VMs (etcd) + the private API LB (10.40.11.5)."
          groups      = ["resources"]
        }
      }
    }
  }
}

module "netbird" {
  source = "../../../../shared/modules/netbird-env"

  partition   = var.partition
  name_prefix = "yucca_${var.partition}_${var.region}" # yucca_prod_htz_fsn1 (slug normalized in the module)
  vault       = "yucca_tf_${var.partition}"            # yucca_tf_prod

  groups     = var.groups
  setup_keys = var.setup_keys
  policies   = var.policies
  networks   = local.netbird_networks
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
