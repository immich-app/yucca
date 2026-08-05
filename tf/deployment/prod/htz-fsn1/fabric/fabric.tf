# Switch fabric: shared spine core + per-cluster leaf pairs + login on every VC.
# New cluster = leaf provider (providers.tf) + cluster-fabric/login modules here
# + serials in tfvars. Login users come from shared/modules/identity
# (fabric-mapped groups) — manage people/groups there, not here.

module "identity" {
  source = "../../../../shared/modules/identity"
}

module "core" {
  source    = "../../../../shared/modules/core-fabric"
  providers = { junos = junos.spine }

  public_vlan_id    = module.addr_cls1.public_vlan_id
  private_vlan_id   = module.addr_cls1.private_vlan_id
  host_mgmt_vlan_id = module.addr_cls1.host_mgmt_vlan_id
  kube_vlan_id      = module.addr_site.kube_vlan_id
  mgmt_vlan_id      = module.addr_site.mgmt_vlan_id

  vc_member_serials = var.spine_vc_serials

  # Port 0 = father CP breakout at 10G (CPs' 82599 NICs are 10G-only, QSFP+
  # 4x10G breakout cables); ports 1-3 stay 25G.
  breakout_ports = { 0 = "10g", 1 = "25g", 2 = "25g", 3 = "25g" }

  # Worker LAGs: 25G breakouts of port 2, one leg per VC member; pairs derived
  # from LLDP (consecutive MACs on each node's dual-port Broadcom NIC):
  #   ae1 = ...46:a1:3a/3b   ae2 = ...47:05:c4/c5   ae3 = ...4e:86:c5/c6
  node_lags = {
    ae1 = ["et-0/0/2:2", "et-1/0/2:3"]
    ae2 = ["et-0/0/2:3", "et-1/0/2:2"]
    ae3 = ["et-0/0/2:1", "et-1/0/2:1"]
  }
  # Spine routes kube ↔ cls1-public: workers' fabric path to the spice RGW
  # (michael S3, never NetBird). IRB = last usable /23 address; leaf keeps .1.
  public_routing = {
    cidr = module.addr_cls1.public_cidr
    ip   = "${cidrhost(module.addr_cls1.public_cidr, 510)}/${module.addr_cls1.prefixlen}"
  }

  # CP LAGs: port-0 10G breakout legs (xe-), one per VC member, trunking kube-cp.
  # Pairing VERIFIED 2026-07-15 via MAC learning (NIC port 1 → FPC 0, port 2 →
  # FPC 1): ae4 = harlan …0a:fe:c8/ca  ae5 = imelda …09:68:68/6a  ae6 = roscoe …65:07:40/42
  cp_node_lags = {
    ae4 = ["xe-0/0/0:2", "xe-1/0/0:2"]
    ae5 = ["xe-0/0/0:1", "xe-1/0/0:1"]
    ae6 = ["xe-0/0/0:0", "xe-1/0/0:0"]
  }

  # kube-cp VLAN + its spine IRB (10.40.11.1) — the spine routes kube↔kube-cp.
  kube_cp = {
    vlan_id = module.addr_site.kube_cp_vlan_id
    cidr    = module.addr_site.kube_cp_cidr
  }

  # Cilium node iBGP: spine dynamic-peers workers from the kube subnet, accepting
  # LB /32s (covered by the transit aggregate). Concrete pool ranges live only in
  # the Cilium LoadBalancerIPPools.
  node_bgp = {
    peer_range = module.addr_site.kube_cidr
    # Internal LB VIPs: accepted but NOT transit-advertised — on-net only.
    accept_prefixes = [module.addr_site.lb_internal_cidr]
  }

  # sFlow → in-cluster sflow-rt (netops, VIP .14 in lb_internal via Cilium iBGP
  # /32). sFlow attaches to member ports, not ae bundles: worker bonds
  # (et-*/0/2:*), mgmt (et-*/0/3:0), transit (et-0/0/27), leaf uplink (et-*/0/30,31).
  sflow = {
    collector = cidrhost(module.addr_site.lb_internal_cidr, 14)
    agent_id  = "69.48.224.254"
    interfaces = [
      "et-0/0/2:1", "et-0/0/2:2", "et-0/0/2:3",
      "et-1/0/2:1", "et-1/0/2:2", "et-1/0/2:3",
      "xe-0/0/0:0", "xe-0/0/0:1", "xe-0/0/0:2",
      "xe-1/0/0:0", "xe-1/0/0:1", "xe-1/0/0:2",
      "et-0/0/3:0", "et-1/0/3:0",
      "et-0/0/27",
      "et-0/0/30", "et-0/0/31", "et-1/0/30", "et-1/0/31",
    ]
  }

  # Worker internet egress via fabric: each worker SNATs to a public /32; these
  # are the return routes. Node SNAT + default route live in
  # kubernetes/.../node-egress and MUST match these IPs.
  node_egress = {
    "10.40.10.11" = "69.48.224.241"
    "10.40.10.12" = "69.48.224.242"
    "10.40.10.13" = "69.48.224.243"
  }

  # One transit today (Core-Backbone). Multi-home: add an entry with prepend>0 +
  # lower local_pref (core-fabric/transit.tf; those knobs need a provider regen).
  local_as = 402421
  transits = {
    core-backbone = {
      interface = "et-0/0/27"
      local_v4  = "5.56.17.225/31"
      local_v6  = "2a01:4a0:1338:226::2/64"
      peer_v4   = "5.56.17.224"
      peer_v6   = "2a01:4a0:1338:226::1"
      peer_as   = 33891
      advertise = "69.48.224.0/24"
      loopback  = "69.48.224.254/32"
    }
  }
}

module "cluster_cls1" {
  source    = "../../../../shared/modules/cluster-fabric"
  providers = { junos = junos.leaf_cls1 }

  public_cidr       = module.addr_cls1.public_cidr
  private_cidr      = module.addr_cls1.private_cidr
  host_mgmt_cidr    = module.addr_cls1.host_mgmt_cidr
  public_gateway    = module.addr_cls1.public_gateway
  private_gateway   = module.addr_cls1.private_gateway
  host_mgmt_gateway = module.addr_cls1.host_mgmt_gateway
  public_vlan_id    = module.addr_cls1.public_vlan_id
  private_vlan_id   = module.addr_cls1.private_vlan_id
  host_mgmt_vlan_id = module.addr_cls1.host_mgmt_vlan_id
  kube_vlan_id      = module.addr_site.kube_vlan_id
  mgmt_vlan_id      = module.addr_site.mgmt_vlan_id
  prefixlen         = module.addr_cls1.prefixlen

  vc_member_serials = var.cls1_leaf_serials
}

# Resolvers set here, not on core: one resource must own the whole `system` container per switch.
locals {
  fabric_name_servers = ["1.1.1.1", "9.9.9.9", "2606:4700:4700::1111", "2620:fe::fe"]

  # Read-only login for netops (exporter/hyperglass/oxidized —
  # kubernetes/apps/prod/htz-fsn1/netops/). `network` = ping/traceroute; no
  # configure. Private key ONLY in cluster Secret + 1P, never git.
  netops_classes = {
    netops-ro = { permissions = ["view", "view-configuration", "network"] }
  }
  netops_users = {
    netops = {
      class            = "netops-ro"
      uid              = 3000
      full_name        = "netops read-only (exporter/LG/backup)"
      ssh_ed25519_keys = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJSaBWwn5kKONxc0bc1w39xYBeBFAuqRWzMQTBM0xCmb netops@father"]
      # For password-only tools (hyperglass/netmiko). Hash injected from 1P.
      encrypted_password = var.netops_password_hash != "" ? var.netops_password_hash : null
    }
  }
}

module "login_spine" {
  source    = "../../../../shared/modules/fabric-login"
  providers = { junos = junos.spine }

  users        = merge(module.identity.fabric_login.users, local.netops_users)
  classes      = merge(module.identity.fabric_login.classes, local.netops_classes)
  name_servers = local.fabric_name_servers
}

module "login_leaf_cls1" {
  source    = "../../../../shared/modules/fabric-login"
  providers = { junos = junos.leaf_cls1 }

  users        = merge(module.identity.fabric_login.users, local.netops_users)
  classes      = merge(module.identity.fabric_login.classes, local.netops_classes)
  name_servers = local.fabric_name_servers
}
