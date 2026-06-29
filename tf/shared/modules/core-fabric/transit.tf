# Upstream IP-transit eBGP uplinks on the spine (e.g. Core-Backbone), supporting
# MULTIPLE transits for multi-homing:
#   • each transit is its own eBGP group (v4 + v6 neighbors) on its own uplink.
#   • `prepend` (export): advertise our prefix with our AS prepended N times, so
#     the Internet prefers the transit(s) with prepend 0 for INBOUND to our prefix.
#   • `local_pref` (import): local-preference applied to the received default, so
#     the highest-local_pref transit is our OUTBOUND default route.
#
# var.transits is keyed by name (the bgp group name; policies derive as
# <UPPER-NAME>-OUT / -IN). Import is DEFAULT-ONLY (the QFX FIB can't hold full).
#
# NOTE (JTAF): `as-path-prepend` and `local-preference` must exist in the provider
# schema to be applied — i.e. configured on a device + `fabric:provider-gen` rerun.
# A primary with prepend=0 / local_pref=null emits neither (schema-safe today);
# add a prepended/local-pref'd backup => apply it once + regen, then it's in TF.
locals {
  transits = var.transits

  # One uplink interface per transit.
  transit_interfaces = [
    for name, t in local.transits : {
      name = t.interface
      mtu  = 9216
      unit = [{
        name = 0
        family = [{
          inet  = [{ address = [{ name = t.local_v4 }] }]
          inet6 = [{ address = [{ name = t.local_v6 }] }]
        }]
      }]
    }
  ]

  # routing-options: our AS (once) + one discard per unique advertised prefix.
  _advertised = distinct([for name, t in local.transits : t.advertise])
  transit_routing_options = var.local_as == null ? [] : [
    {
      autonomous_system = [{ as_number = tostring(var.local_as) }]
      static            = [{ route = [for p in local._advertised : { name = p, discard = "" }] }]
    }
  ]

  # One eBGP group per transit, each with a v4 + v6 neighbor.
  transit_bgp = length(local.transits) == 0 ? null : [
    {
      group = [
        for name, t in local.transits : {
          name    = name
          type    = "external"
          peer_as = tostring(t.peer_as)
          neighbor = [
            { name = t.peer_v4, family = [{ inet = [{ unicast = [{}] }] }], import = ["${upper(name)}-IN"], export = ["${upper(name)}-OUT"] },
            { name = t.peer_v6, family = [{ inet6 = [{ unicast = [{}] }] }], import = ["${upper(name)}-IN"], export = ["${upper(name)}-OUT"] },
          ]
        }
      ]
    }
  ]

  # Per-transit OUT (advertise our prefix, prepend N) + IN (default-only, local-pref).
  # merge() keeps the `then` schema-safe: prepend 0 / local_pref null emit nothing extra.
  transit_policy_options = length(local.transits) == 0 ? [] : [
    {
      policy_statement = flatten([
        for name, t in local.transits : [
          {
            name = "${upper(name)}-OUT"
            term = [
              {
                name = "our-prefix"
                from = [{ route_filter = [{ address = t.advertise, exact = "" }] }]
                then = [merge(
                  { accept = "" },
                  t.prepend > 0 ? { as_path_prepend = join(" ", [for i in range(t.prepend) : tostring(var.local_as)]) } : {},
                )]
              },
              { name = "reject-rest", then = [{ reject = "" }] },
            ]
          },
          {
            name = "${upper(name)}-IN"
            term = [
              {
                name = "default4"
                from = [{ route_filter = [{ address = "0.0.0.0/0", exact = "" }] }]
                then = [merge({ accept = "" }, t.local_pref == null ? {} : { local_preference = tostring(t.local_pref) })]
              },
              {
                name = "default6"
                from = [{ route_filter = [{ address = "::/0", exact = "" }] }]
                then = [merge({ accept = "" }, t.local_pref == null ? {} : { local_preference = tostring(t.local_pref) })]
              },
              { name = "reject-rest", then = [{ reject = "" }] },
            ]
          },
        ]
      ])
    }
  ]
}
