locals {
  trunk_members = [
    "vlan${var.public_vlan_id}", "vlan${var.private_vlan_id}",
    "vlan${var.kube_vlan_id}", "vlan${var.mgmt_vlan_id}",
    "vlan${var.host_mgmt_vlan_id}",
  ]

  # Pre-staged jumbo access ports et-0/0/0..29 (physical mtu only; their empty
  # unit 0, if any, is left untouched by the per-resource provider).
  access_ports = toset([for i in range(30) : "et-0/0/${i}"])

  # ae0 = spine<->leaf LAG members, two per VC member.
  ae0_members = toset(["et-0/0/30", "et-0/0/31", "et-1/0/30", "et-1/0/31"])
}

resource "junos_interface_physical" "access" {
  for_each = local.access_ports
  name     = each.value
  mtu      = 9216
}

resource "junos_interface_physical" "ae0_member" {
  for_each = local.ae0_members
  name     = each.value
  ether_opts {
    ae_8023ad = "ae0"
  }
}

resource "junos_interface_physical" "ae0" {
  name = "ae0"
  mtu  = 9216
  parent_ether_opts {
    lacp {
      mode = "active"
    }
  }
  trunk         = true
  vlan_members  = local.trunk_members
  storm_control = "default"

  # jeremmfr commits per-resource: a trunk member is rejected if the VLAN isn't
  # on the box yet, so create the VLANs first.
  depends_on = [junos_vlan.this]
}

# Bare-metal node LACP bonds (kube workers) terminated on the core. Each ae bundles
# the two channelized 25G ports cabled to one node (one per VC member) into an
# LACP-active trunk carrying the kube VLAN. Mirrors the ae0 pattern; the members'
# ether_opts point them at their ae, the ae holds LACP + the trunk. device-count is
# auto-managed by the provider from the ae interfaces.
locals {
  node_lag_members = merge([for ae, ports in var.node_lags : { for p in ports : p => ae }]...)
}

resource "junos_interface_physical" "node_lag_member" {
  for_each = local.node_lag_members
  name     = each.key
  ether_opts {
    ae_8023ad = each.value
  }
}

resource "junos_interface_physical" "node_lag" {
  for_each = var.node_lags
  name     = each.key
  mtu      = 9216
  parent_ether_opts {
    lacp {
      mode = "active"
    }
  }
  trunk        = true
  vlan_members = ["vlan${var.kube_vlan_id}"]
}

# Management-node ports (mgmt-1, mgmt-2) — one channelized port-3 leg per VC member,
# each a single-port trunk of the stretched VLANs. Identical config per node.
resource "junos_interface_physical" "mgmt_node" {
  for_each     = toset(var.mgmt_node_ports)
  name         = each.value
  trunk        = true
  vlan_members = local.trunk_members

  depends_on = [junos_vlan.this]
}

# Preserve the previously-single mgmt-1 port resource (don't destroy/recreate it).
moved {
  from = junos_interface_physical.mgmt1_port
  to   = junos_interface_physical.mgmt_node["et-1/0/3:0"]
}

# NOTE: vme (the mgmt IP / NETCONF lifeline) is deliberately NOT managed here —
# it's left untouched on the device, like the leaf's vme, so no apply can break the
# management path.

# Transit uplink unit(s) — routed v4/v6 toward each upstream (et-0/0/27 etc.).
# The physical port's mtu comes from the access-port set above (et-0/0/0..29).
resource "junos_interface_logical" "transit" {
  for_each = var.transits
  name     = "${each.value.interface}.0"
  family_inet {
    address {
      cidr_ip = each.value.local_v4
    }
  }
  family_inet6 {
    address {
      cidr_ip = each.value.local_v6
    }
  }
}

# lo0: the advertised-space loopback host(s) + the RE-protection input filters.
# Only when transit is configured (the spine then has Internet adjacency).
resource "junos_interface_logical" "lo0" {
  count = length(var.transits) > 0 ? 1 : 0
  name  = "lo0.0"
  family_inet {
    dynamic "address" {
      for_each = [for name, t in var.transits : t.loopback if t.loopback != null]
      content {
        cidr_ip = address.value
      }
    }
    filter_input = "PROTECT-RE"
  }
  family_inet6 {
    filter_input = "PROTECT-RE6"
  }
}
