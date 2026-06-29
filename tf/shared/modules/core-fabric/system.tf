locals {
  forwarding_options_block = [
    {
      storm_control_profiles = [
        {
          name = "default"
          all = [
            {
              bandwidth_level = 10000
            }
          ]
        }
      ]
    }
  ]

  # Routing-options come from the transit uplink (autonomous-system + the
  # originated discard prefix). The old static OOB default was removed at cutover
  # — the spine's default is now the eBGP default. Empty when no transit.
  routing_options_block = local.transit_routing_options

  protocols_block = [
    {
      lldp = [
        {
          interface = [
            {
              name = "all"
            }
          ]
        }
      ]
      # eBGP transit group (v4 + v6), or null when no transit configured.
      bgp = local.transit_bgp
    }
  ]

  virtual_chassis_block = [{
    preprovisioned = ""
    member = [
      for i, serial in var.vc_member_serials : {
        name          = i
        role          = "routing-engine"
        serial_number = serial
      }
    ]
  }]

  # system name-servers (default resolvers). Merged into `system` — only this
  # slice; fabric-login owns `system login` via its own resource. Empty = unset.
  system_block = length(var.name_servers) == 0 ? [] : [
    {
      name_server = [for ns in var.name_servers : { name = ns }]
    }
  ]
}
