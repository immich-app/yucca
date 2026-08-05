locals {
  trunk_members = [
    "vlan${var.public_vlan_id}", "vlan${var.private_vlan_id}",
    "vlan${var.kube_vlan_id}", "vlan${var.mgmt_vlan_id}",
    "vlan${var.host_mgmt_vlan_id}",
  ]

  # Pre-staged jumbo access ports (physical mtu only; empty unit 0 untouched).
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

  # jeremmfr commits per-resource: trunk member rejected until the VLAN exists.
  depends_on = [junos_vlan.this]
}

# Worker LACP bonds on the core: each ae = the two 25G ports cabled to one node
# (one per VC member), trunking the kube VLAN. ae device-count is provider-managed.
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

# CP bonds — as node_lags but trunking kube-cp (the CPs' only fabric presence).
locals {
  cp_node_lag_members = merge([for ae, ports in var.cp_node_lags : { for p in ports : p => ae }]...)
}

resource "junos_interface_physical" "cp_node_lag_member" {
  for_each = local.cp_node_lag_members
  name     = each.key
  ether_opts {
    ae_8023ad = each.value
  }
}

resource "junos_interface_physical" "cp_node_lag" {
  for_each = var.cp_node_lags
  name     = each.key
  mtu      = 9216
  parent_ether_opts {
    lacp {
      mode = "active"
    }
  }
  trunk        = true
  vlan_members = ["vlan${var.kube_cp.vlan_id}"]

  depends_on = [junos_vlan.this]
}

# Mgmt-node ports: one port-3 leg per VC member, single-port trunk of the
# stretched VLANs. mtu 9216 required — a default-1514 member carrying the kube
# VLAN clamps irb.10's operational MTU to 1500 despite the unit's 9202; the
# 1500-MTU mgmt hosts are unaffected (switchport MTU is only a ceiling).
resource "junos_interface_physical" "mgmt_node" {
  for_each     = toset(var.mgmt_node_ports)
  name         = each.value
  mtu          = 9216
  trunk        = true
  vlan_members = local.trunk_members

  depends_on = [junos_vlan.this]
}

# Preserve the previously-single mgmt-1 port resource.
moved {
  from = junos_interface_physical.mgmt1_port
  to   = junos_interface_physical.mgmt_node["et-1/0/3:0"]
}

# vme (mgmt IP / NETCONF lifeline) is deliberately NOT managed — no apply can
# break the management path.

# IRB physical ceiling 9216 (default 1514 caps routed hops at 1500). Per-unit
# inet MTU (irb_unit_mtu) is set EXPLICITLY on each routed unit — physical-MTU
# inheritance doesn't reliably recalc existing units on Junos. Raw set-config on
# purpose: a typed "irb" resource would `delete interfaces irb` on destroy,
# taking the IRB units (the fabric's gateways) down.
resource "junos_null_load_config" "irb_jumbo" {
  action = "set"
  config = "set interfaces irb mtu 9216"
}

# Transit uplink unit(s); physical mtu comes from the access-port set above.
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

# lo0: advertised-space loopbacks + RE-protection filters; only with transit
# configured (Internet adjacency).
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
