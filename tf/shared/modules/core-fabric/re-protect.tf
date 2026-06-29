# Control-plane (RE) protection + the transit loopback(s). Generated when transit
# is configured (the spine then has Internet adjacency). The lo0 input filter
# restricts management (SSH 22 / NETCONF 830) to trusted sources and drops it from
# everywhere else (incl. the transit), while accepting all other RE-bound traffic
# (BGP, ICMP, VC control, return traffic, ...). On QFX, RE-bound filtering must be
# on lo0 — an ingress interface filter does NOT catch host-bound traffic.
locals {
  _re_enabled = length(local.transits) > 0
  _loopbacks  = [for name, t in local.transits : t.loopback if t.loopback != null]

  firewall_block = local._re_enabled ? [
    {
      family = [
        {
          inet = [
            {
              filter = [
                {
                  name = "PROTECT-RE"
                  term = [
                    {
                      name = "mgmt-trusted"
                      from = [{
                        source_address   = [for s in var.mgmt_trusted_sources : { name = s }]
                        protocol         = ["tcp"]
                        destination_port = ["22", "830"]
                      }]
                      then = [{ accept = "" }]
                    },
                    {
                      name = "mgmt-drop"
                      from = [{ protocol = ["tcp"], destination_port = ["22", "830"] }]
                      then = [{ discard = [{}] }]
                    },
                    { name = "default", then = [{ accept = "" }] },
                  ]
                }
              ]
            }
          ]
          inet6 = [
            {
              filter = [
                {
                  name = "PROTECT-RE6"
                  term = [
                    {
                      name = "mgmt-drop"
                      from = [{ next_header = ["tcp"], destination_port = ["22", "830"] }]
                      then = [{ discard = "" }]
                    },
                    { name = "default", then = [{ accept = "" }] },
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ] : []

  # lo0: the advertised-space loopback host(s) + the RE filter applied inbound.
  lo0_block = local._re_enabled ? [
    {
      name = "lo0"
      unit = [{
        name = 0
        family = [{
          inet = [{
            filter  = [{ input = ["PROTECT-RE"] }]
            address = [for lb in local._loopbacks : { name = lb }]
          }]
          inet6 = [{ filter = [{ input = ["PROTECT-RE6"] }] }]
        }]
      }]
    }
  ] : []
}
