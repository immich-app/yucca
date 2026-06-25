locals {
  # Every server bond + the uplink carry the cluster's public/private plus the
  # site-global api/mgmt VLANs.
  trunk_members = [local.public_vlan_name, local.private_vlan_name, local.api_vlan_name, local.mgmt_vlan_name]

  # ── Server bonds: ae<k> = et-0/0/<k-1> + et-1/0/<k-1>, LACP, pub/priv trunk ──
  server_lags = [
    for k in range(1, var.server_lag_count + 1) : {
      name                     = "ae${k}"
      aggregated_ether_options = [{ lacp = [{ active = "" }] }]
      unit = [{
        name   = 0
        family = [{ ethernet_switching = [{ interface_mode = "trunk", vlan = [{ members = local.trunk_members }] }] }]
      }]
    }
  ]

  # Each bond's two physical members, one per VC member (fpc 0 and fpc 1).
  server_members = flatten([
    for fpc in [0, 1] : [
      for p in range(var.server_lag_count) : {
        name          = "et-${fpc}/0/${p}"
        ether_options = [{ ieee_802_3ad = [{ bundle = "ae${p + 1}" }] }]
      }
    ]
  ])

  # ── Spine uplink bond ae0 (4x100G) ──────────────────────────────────────────
  uplink_members = [
    for name in var.uplink_ports : {
      name          = name
      ether_options = [{ ieee_802_3ad = [{ bundle = "ae0" }] }]
    }
  ]

  uplink_lag = {
    name                     = "ae0"
    mtu                      = var.jumbo_mtu
    aggregated_ether_options = [{ lacp = [{ active = "" }] }]
    unit = [{
      name = 0
      family = [{ ethernet_switching = [{
        interface_mode = "trunk"
        vlan           = [{ members = local.trunk_members }]
        storm_control  = [{ profile_name = "default" }]
      }] }]
    }]
  }

  # ── IRB gateways for the cluster networks (inter-VLAN filter applied) ────────
  irb = {
    name = "irb"
    unit = [
      {
        name = var.public_vlan_id
        family = [{ inet = [{
          filter  = [{ input = [{ filter_name = "NO-CROSS-VLAN" }] }]
          address = [{ name = "${var.public_gateway}/${var.prefixlen}" }]
        }] }]
      },
      {
        name = var.private_vlan_id
        family = [{ inet = [{
          filter  = [{ input = [{ filter_name = "NO-CROSS-VLAN" }] }]
          address = [{ name = "${var.private_gateway}/${var.prefixlen}" }]
        }] }]
      },
    ]
  }

  interfaces_block = [{
    interface = concat(
      local.server_members,
      local.uplink_members,
      [local.irb, local.uplink_lag],
      local.server_lags,
    )
  }]
}
