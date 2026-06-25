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

  routing_options_block = [
    {
      static = [
        {
          route = [
            {
              name = "0.0.0.0/0"
              next_hop = [
                "10.40.5.1"
              ]
            }
          ]
        }
      ]
    }
  ]

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
}
