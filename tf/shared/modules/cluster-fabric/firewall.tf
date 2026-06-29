# Stop traffic routing between the cluster's public and private networks; the IRBs
# apply this as an input filter. Default term accepts everything else.
resource "junos_firewall_filter" "no_cross_vlan" {
  name   = "NO-CROSS-VLAN"
  family = "inet"

  term {
    name = "block-public-to-private"
    from {
      source_address      = [var.public_cidr]
      destination_address = [var.private_cidr]
    }
    then {
      action = "discard"
    }
  }
  term {
    name = "block-private-to-public"
    from {
      source_address      = [var.private_cidr]
      destination_address = [var.public_cidr]
    }
    then {
      action = "discard"
    }
  }
  term {
    name = "default"
    then {
      action = "accept"
    }
  }
}
