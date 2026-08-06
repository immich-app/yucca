# Applied as each IRB's input filter, so it only blocks ROUTED inter-segment
# traffic — hosts sharing a segment still talk intra-VLAN.
locals {
  cross_vlan_segments = {
    public    = var.public_cidr
    private   = var.private_cidr
    host-mgmt = var.host_mgmt_cidr
  }
  cross_vlan_pairs = [
    for p in setproduct(keys(local.cross_vlan_segments), keys(local.cross_vlan_segments)) :
    { src = p[0], dst = p[1] } if p[0] != p[1]
  ]
}

resource "junos_firewall_filter" "no_cross_vlan" {
  name   = "NO-CROSS-VLAN"
  family = "inet"

  dynamic "term" {
    for_each = local.cross_vlan_pairs
    content {
      name = "block-${term.value.src}-to-${term.value.dst}"
      from {
        source_address      = [local.cross_vlan_segments[term.value.src]]
        destination_address = [local.cross_vlan_segments[term.value.dst]]
      }
      then {
        action = "discard"
      }
    }
  }
  term {
    name = "default"
    then {
      action = "accept"
    }
  }
}
