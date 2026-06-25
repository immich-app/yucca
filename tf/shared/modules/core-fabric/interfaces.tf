# Spine interfaces are bespoke (breakout legs, spine<->leaf ae0, VCP, the mgmt-1
# port et-1/0/3:0) — not a uniform pattern, so kept faithful here. VLAN members
# reference the generated vlan names.
locals {
  interfaces_block = [
    {
      interface = [
        {
          name = "et-0/0/0"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/1"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/2"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/3"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/4"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/5"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/6"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/7"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/8"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/9"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/10"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/11"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/12"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/13"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/14"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/15"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/16"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/17"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/18"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/19"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/20"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/21"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/22"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/23"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/24"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/25"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/26"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/27"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/28"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/29"
          mtu  = 9216
          unit = [
            {
              name = 0
            }
          ]
        },
        {
          name = "et-0/0/30"
          ether_options = [
            {
              ieee_802_3ad = [
                {
                  bundle = "ae0"
                }
              ]
            }
          ]
        },
        {
          name = "et-0/0/31"
          ether_options = [
            {
              ieee_802_3ad = [
                {
                  bundle = "ae0"
                }
              ]
            }
          ]
        },
        {
          name = "et-1/0/3:0"
          unit = [
            {
              name = 0
              family = [
                {
                  ethernet_switching = [
                    {
                      interface_mode = "trunk"
                      vlan = [
                        {
                          members = [
                            "vlan${var.public_vlan_id}",
                            "vlan${var.private_vlan_id}", "vlan${var.api_vlan_id}", "vlan${var.mgmt_vlan_id}"
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          name = "et-1/0/30"
          ether_options = [
            {
              ieee_802_3ad = [
                {
                  bundle = "ae0"
                }
              ]
            }
          ]
        },
        {
          name = "et-1/0/31"
          ether_options = [
            {
              ieee_802_3ad = [
                {
                  bundle = "ae0"
                }
              ]
            }
          ]
        },
        {
          name = "ae0"
          mtu  = 9216
          aggregated_ether_options = [
            {
              lacp = [
                {
                  active = ""
                }
              ]
            }
          ]
          unit = [
            {
              name = 0
              family = [
                {
                  ethernet_switching = [
                    {
                      interface_mode = "trunk"
                      vlan = [
                        {
                          members = [
                            "vlan${var.public_vlan_id}",
                            "vlan${var.private_vlan_id}", "vlan${var.api_vlan_id}", "vlan${var.mgmt_vlan_id}"
                          ]
                        }
                      ]
                      storm_control = [
                        {
                          profile_name = "default"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          name = "vme"
          unit = [
            {
              name = 0
              family = [
                {
                  inet = [
                    {
                      address = [
                        {
                          name = "10.40.5.115/24"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
