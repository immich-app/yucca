locals {
  trunk_members = [
    "vlan${var.public_vlan_id}", "vlan${var.private_vlan_id}",
    "vlan${var.host_mgmt_vlan_id}",
    "vlan${var.api_vlan_id}", "vlan${var.mgmt_vlan_id}",
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

# Server bonds (LACP trunks).
resource "junos_interface_physical" "server_lag" {
  for_each = local.server_lag_names
  name     = each.value
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

resource "junos_interface_logical" "irb_private" {
  name = "irb.${var.private_vlan_id}"
  family_inet {
    address {
      cidr_ip = "${var.private_gateway}/${var.prefixlen}"
    }
    filter_input = "NO-CROSS-VLAN"
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
