# Switch fabric: the shared spine core + each cluster's leaf pair, plus login
# (users/keys/rights) on every VC. Add a cluster by adding its leaf provider
# (providers.tf), a cluster-fabric + login module here, and its serials in tfvars.
#
# Login is driven by the central identity registry (shared/modules/identity):
# members of fabric-mapped groups (e.g. `fabric-admins` -> super-user) become
# login users on every VC. Manage people/groups there, not here.

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

  # Port 0 carries the father control-plane breakout at 10G (the CPs' Intel 82599
  # NICs are 10G-only; needs the QSFP+ 4x10G breakout cables — see cp_node_lags);
  # ports 1-3 stay 25G (workers + mgmt + spares).
  breakout_ports = { 0 = "10g", 1 = "25g", 2 = "25g", 3 = "25g" }

  # father's bare-metal kube workers hang off the core (channelized 25G breakouts of
  # port 2, one leg per VC member). Each ae bundles the two ports cabled to one node
  # (pairs derived from LLDP — consecutive MACs on the node's dual-port Broadcom NIC):
  #   ae1 = ...46:a1:3a/3b   ae2 = ...47:05:c4/c5   ae3 = ...4e:86:c5/c6
  node_lags = {
    ae1 = ["et-0/0/2:2", "et-1/0/2:3"]
    ae2 = ["et-0/0/2:3", "et-1/0/2:2"]
    ae3 = ["et-0/0/2:1", "et-1/0/2:1"]
  }
  # Spine routes kube ↔ cls1-public (same pattern as kube↔kube-cp): the workers'
  # fabric path to the spice RGW frontend (michael S3 traffic, not via NetBird).
  # IRB = last usable /23 address; the leaf keeps the .1 host gateway.
  public_routing = {
    cidr = module.addr_cls1.public_cidr
    ip   = "${cidrhost(module.addr_cls1.public_cidr, 510)}/${module.addr_cls1.prefixlen}"
  }

  # father's bare-metal control planes: port-0 breakout legs at 10G (xe-), one leg
  # per VC member, trunking the kube-cp VLAN. Pairing VERIFIED 2026-07-15 via MAC
  # learning against the maintenance-mode nodes (NIC port 1 → FPC 0, port 2 →
  # FPC 1, same leg index on both members):
  #   ae4 = harlan …0a:fe:c8/ca   ae5 = imelda …09:68:68/6a   ae6 = roscoe …65:07:40/42
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

  # Cilium node iBGP for LoadBalancer VIPs — the spine gets its first IRB (the kube net's
  # .1 gateway) and dynamic-peers the workers from the kube subnet, accepting the LB /32s
  # they advertise (covered by the transit aggregate, so reachable north-south). The
  # concrete LB pool ranges live only in the Cilium LoadBalancerIPPools.
  node_bgp = {
    peer_range = module.addr_site.kube_cidr
    # Internal (NetBird-only) LB VIPs — accepted from the nodes but NOT in the
    # transit-advertised space, so they are reachable on-net only.
    accept_prefixes = [module.addr_site.lb_internal_cidr]
  }

  # sFlow → the in-cluster sflow-rt collector (netops, VIP .14 in lb_internal —
  # reachable on the spine via the Cilium iBGP /32). Counter samples every 5s =
  # the seconds-granularity bandwidth feed; every up physical port is listed
  # (sFlow attaches to members, not ae bundles): worker bonds (et-*/0/2:*), mgmt
  # hosts (et-*/0/3:0), transits (et-0/0/27 Core-Backbone, et-1/0/27 Colt),
  # leaf uplink ae0 (et-*/0/30,31).
  sflow = {
    collector = cidrhost(module.addr_site.lb_internal_cidr, 14)
    agent_id  = "69.48.224.254"
    interfaces = [
      "et-0/0/2:1", "et-0/0/2:2", "et-0/0/2:3",
      "et-1/0/2:1", "et-1/0/2:2", "et-1/0/2:3",
      "xe-0/0/0:0", "xe-0/0/0:1", "xe-0/0/0:2",
      "xe-1/0/0:0", "xe-1/0/0:1", "xe-1/0/0:2",
      "et-0/0/3:0", "et-1/0/3:0",
      "et-0/0/27", "et-1/0/27",
      "et-0/0/30", "et-0/0/31", "et-1/0/30", "et-1/0/31",
    ]
  }

  # Worker internet egress via the fabric (40G transit vs 1 GbE eth0): each worker SNATs
  # to a public /32 and default-routes via the core; these are the return routes. The
  # node SNAT + default route live in kubernetes/.../node-egress (must match these IPs).
  node_egress = {
    "10.40.10.11" = "69.48.224.241"
    "10.40.10.12" = "69.48.224.242"
    "10.40.10.13" = "69.48.224.243"
  }

  # Upstream IP-transit, multi-homed: Core-Backbone is primary/default (prepend 0,
  # default local-pref); Colt is the backup — our /24 goes out prepended once and
  # its received default sits at a lower local-pref, so it only carries traffic
  # when Core-Backbone is down. See core-fabric/transit.tf.
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
    # v4-only handover (no v6 delivered). Colt's inbound route filter accepts
    # 69.48.224.0/22 le /24 from AS402421, so the /24 fits; widening past that
    # needs a Colt Online ticket.
    colt = {
      interface  = "et-1/0/27"
      local_v4   = "62.67.19.110/30"
      peer_v4    = "62.67.19.109"
      peer_as    = 8220
      advertise  = "69.48.224.0/24"
      prepend    = 1
      local_pref = 90
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

# Default DNS resolvers (Cloudflare + Quad9, dual-stack). Set here, not on core,
# so a single resource owns the whole `system` container per switch.
locals {
  fabric_name_servers = ["1.1.1.1", "9.9.9.9", "2606:4700:4700::1111", "2620:fe::fe"]

  # Read-only service login for the netops stack (junos_exporter metrics, hyperglass
  # looking glass, oxidized config backup — kubernetes/apps/prod/htz-fsn1/netops/).
  # `network` grants ping/traceroute (the looking glass); no configure rights. The
  # private key lives ONLY in the cluster (Secret) + 1Password, never in git.
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
