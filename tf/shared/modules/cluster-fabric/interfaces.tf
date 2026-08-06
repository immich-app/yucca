locals {
  trunk_members = [
    "vlan${var.public_vlan_id}", "vlan${var.private_vlan_id}",
    "vlan${var.host_mgmt_vlan_id}",
    "vlan${var.kube_vlan_id}", "vlan${var.mgmt_vlan_id}",
  ]

  server_lag_names = toset([for k in range(1, var.server_lag_count + 1) : "ae${k}"])

  # Two members per bond, one per VC member (fpc 0 and fpc 1), + the uplink's.
  member_bundles = merge(
    { for k in range(1, var.server_lag_count + 1) : "et-0/0/${k - 1}" => "ae${k}" },
    { for k in range(1, var.server_lag_count + 1) : "et-1/0/${k - 1}" => "ae${k}" },
    { for p in var.uplink_ports : p => "ae0" },
  )
}

resource "junos_interface_physical" "member" {
  for_each = local.member_bundles
  name     = each.key
  ether_opts {
    ae_8023ad = each.value
  }
}

# 802.3ad members inherit the aggregate's MTU (no per-member mtu). Per-VLAN L3
# stays governed by the IRBs — 1500 VLANs untouched.
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

  # jeremmfr commits per-resource: trunk member rejected until the VLAN exists.
  depends_on = [junos_vlan.this]
}

# Spine uplink.
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

resource "junos_interface_logical" "irb_public" {
  name = "irb.${var.public_vlan_id}"
  family_inet {
    address {
      cidr_ip = "${var.public_gateway}/${var.prefixlen}"
    }
    filter_input = "NO-CROSS-VLAN"
  }
}

# Ceph replication: jumbo L3 on this VLAN only (gateway IP MTU = hosts' 9000,
# set per-unit so public/mgmt IRBs stay at 1500).
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

resource "junos_interface_logical" "irb_host_mgmt" {
  name = "irb.${var.host_mgmt_vlan_id}"
  family_inet {
    address {
      cidr_ip = "${var.host_mgmt_gateway}/${split("/", var.host_mgmt_cidr)[1]}"
    }
    filter_input = "NO-CROSS-VLAN"
  }
}
