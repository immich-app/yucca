# Transit eBGP uplinks (multi-homing capable); import is DEFAULT-ONLY — the QFX
# FIB can't hold a full table. prepend (export) / local_pref (import) steer
# primary vs backup. Policies derive as <UPPER-NAME>-OUT / -IN.

locals {
  advertised = toset([for name, t in var.transits : t.advertise])
}

resource "junos_routing_options" "this" {
  count            = var.local_as == null ? 0 : 1
  clean_on_destroy = true
  autonomous_system {
    number = tostring(var.local_as)
  }
  # Other half of the cilium-nodes ECMP (bgp-nodes.tf): install every equal-cost
  # next-hop in the PFE. Only wired with node iBGP; requires local_as.
  dynamic "forwarding_table" {
    for_each = var.node_bgp == null ? [] : [1]
    content {
      export = [junos_policyoptions_policy_statement.ecmp_lb[0].name]
    }
  }
}

# Originate each advertised prefix via a discard route (redistributed by -OUT).
resource "junos_static_route" "advertise" {
  for_each    = local.advertised
  destination = each.value
  discard     = true
}

resource "junos_bgp_group" "transit" {
  for_each = var.transits
  name     = each.key
  type     = "external"
  peer_as  = tostring(each.value.peer_as)
}

# import/export live on the neighbor (matches the device), not the group.
resource "junos_bgp_neighbor" "v4" {
  for_each = var.transits
  group    = junos_bgp_group.transit[each.key].name
  ip       = each.value.peer_v4
  import   = ["${upper(each.key)}-IN"]
  export   = ["${upper(each.key)}-OUT"]
  family_inet {
    nlri_type = "unicast"
  }
}

resource "junos_bgp_neighbor" "v6" {
  for_each = var.transits
  group    = junos_bgp_group.transit[each.key].name
  ip       = each.value.peer_v6
  import   = ["${upper(each.key)}-IN"]
  export   = ["${upper(each.key)}-OUT"]
  family_inet6 {
    nlri_type = "unicast"
  }
}

# OUT: advertise our prefix (prepend N times on backups), reject everything else.
resource "junos_policyoptions_policy_statement" "out" {
  for_each = var.transits
  name     = "${upper(each.key)}-OUT"

  term {
    name = "our-prefix"
    from {
      route_filter {
        route  = each.value.advertise
        option = "exact"
      }
    }
    then {
      action          = "accept"
      as_path_prepend = each.value.prepend > 0 ? join(" ", [for i in range(each.value.prepend) : tostring(var.local_as)]) : null
    }
  }
  term {
    name = "reject-rest"
    then {
      action = "reject"
    }
  }
}

# IN: accept only the default(s) (v4 + v6), local-pref the primary highest.
resource "junos_policyoptions_policy_statement" "in" {
  for_each = var.transits
  name     = "${upper(each.key)}-IN"

  term {
    name = "default4"
    from {
      route_filter {
        route  = "0.0.0.0/0"
        option = "exact"
      }
    }
    then {
      action = "accept"
      dynamic "local_preference" {
        for_each = each.value.local_pref == null ? [] : [each.value.local_pref]
        content {
          action = "none"
          value  = tostring(local_preference.value)
        }
      }
    }
  }
  term {
    name = "default6"
    from {
      route_filter {
        route  = "::/0"
        option = "exact"
      }
    }
    then {
      action = "accept"
      dynamic "local_preference" {
        for_each = each.value.local_pref == null ? [] : [each.value.local_pref]
        content {
          action = "none"
          value  = tostring(local_preference.value)
        }
      }
    }
  }
  term {
    name = "reject-rest"
    then {
      action = "reject"
    }
  }
}
