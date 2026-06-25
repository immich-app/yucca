locals {
  # Storm-control profile referenced by the uplink trunk.
  forwarding_options_block = [{
    storm_control_profiles = [{
      name = "default"
      all  = [{ bandwidth_level = 10000 }]
    }]
  }]

  protocols_block = [{
    lldp = [{ interface = [{ name = "all" }] }]
  }]

  # Preprovisioned VC from the member serials (member 0 + member 1).
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
}
