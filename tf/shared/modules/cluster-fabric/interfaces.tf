locals {
  trunk_members = [
    "vlan${var.public_vlan_id}", "vlan${var.private_vlan_id}",
    "vlan${var.host_mgmt_vlan_id}",
    "vlan${var.kube_vlan_id}", "vlan${var.mgmt_vlan_id}",
  ]

  # Server bonds ae1..aeN, each a trunk of the cluster + site VLANs.
  server_lag_names = toset([for k in range(1, var.server_lag_count + 1) : "ae${k}"])

  # Each bond's two members (one per VC member: fpc 0 and fpc 1) + the uplink's.
  member_bundles = merge(
    { for k in range(1, var.server_lag_count + 1) : "et-0/0/${k - 1}" => "ae${k}" },
    { for k in range(1, var.server_lag_count + 1) : "et-1/0/${k - 1}" => "ae${k}" },
    { for p in var.uplink_ports : p => "ae0" },
  )
}

# Physical members → their aggregate.
resource "junos_interface_physical" "member" {
  for_each = local.member_bundles
  name     = each.key
  ether_opts {
    ae_8023ad = each.value
  }
}

# Server bonds (LACP trunks). Jumbo L2 (matches ae0 + the spine): the aggregate
# carries the physical MTU; 802.3ad members inherit it, so no per-member mtu (see
# the `member` resource above). This raises the L2 ceiling on the whole trunk;
# per-VLAN L3 stays governed by the IRBs, so the 1500 VLANs (120/124) are untouched.
resource "junos_interface_physical" "server_lag" {
  for_each = local.server_lag_names
  name     = each.value
  mtu      = var.jumbo_mtu
  parent_ether_opts {
    lacp {
      mode = "active"
    }
  }
  trunk        = true
  vlan_members = local.trunk_members

  # jeremmfr commits per-resource: a trunk member is rejected if the VLAN isn't
  # on the box yet, so create the VLANs first.
  depends_on = [junos_vlan.this]
}

# Spine uplink bond (jumbo, storm-controlled).
resource "junos_interface_physical" "ae0" {
  name = "ae0"
  mtu  = var.jumbo_mtu
  parent_ether_opts {
    lacp {
      mode = "active"
    }
  }
  trunk         = true
  vlan_members  = local.trunk_members
  storm_control = "default"

  depends_on = [junos_vlan.this]
}

# IRB gateways for the cluster networks (inter-VLAN filter applied inbound).
resource "junos_interface_logical" "irb_public" {
  name = "irb.${var.public_vlan_id}"
  family_inet {
    address {
      cidr_ip = "${var.public_gateway}/${var.prefixlen}"
    }
    filter_input = "NO-CROSS-VLAN"
  }
}

# Cluster (Ceph replication) gateway. Jumbo L3 on this VLAN only: the .1 gateway's
# IP MTU matches the hosts' 9000 (< the 9216 L2 ceiling on the bonds/uplink). Set
# per-unit (family inet mtu) so the public/mgmt IRBs stay at their 1500 default.
resource "junos_interface_logical" "irb_private" {
  name = "irb.${var.private_vlan_id}"
  family_inet {
    address {
      cidr_ip = "${var.private_gateway}/${var.prefixlen}"
    }
    filter_input = "NO-CROSS-VLAN"
    mtu          = var.private_irb_mtu
  }
}

# Host-management gateway. Isolated from the data nets by NO-CROSS-VLAN (the mgmt
# nodes + hosts reach each other intra-VLAN, so SSH is unaffected by the block).
resource "junos_interface_logical" "irb_host_mgmt" {
  name = "irb.${var.host_mgmt_vlan_id}"
  family_inet {
    address {
      cidr_ip = "${var.host_mgmt_gateway}/${split("/", var.host_mgmt_cidr)[1]}"
    }
    filter_input = "NO-CROSS-VLAN"
  }
}
