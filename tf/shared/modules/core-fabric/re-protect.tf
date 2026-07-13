# Control-plane (RE) protection filters, bound on lo0 (see interfaces.tf). Restrict
# management (SSH 22 / NETCONF 830) AND BGP (179) to trusted sources, dropping each
# everywhere else (incl. the transit), while accepting all other RE-bound traffic.
# Generated when transit is configured (the spine then has Internet adjacency).
#
# BGP scoping added after a 2026-07-06 external scan found TCP/179 accepting
# handshakes from the whole internet on the loopback + transit interface: the
# session only ESTABLISHES with a configured neighbor, but an open listener is a
# needless RST/resource-exhaustion surface. Trusted 179 sources = the eBGP transit
# peers + the node iBGP subnet (workers peer the kube-VLAN IRB). Established
# sessions we initiate return to an ephemeral port (default-accept), so this only
# gates inbound connections TO 179.
locals {
  bgp_trusted_v4 = concat(
    [for t in var.transits : "${t.peer_v4}/32"],
    var.node_bgp == null ? [] : [var.node_bgp.peer_range],
  )
  bgp_trusted_v6 = [for t in var.transits : "${t.peer_v6}/128"]
}

resource "junos_firewall_filter" "protect_re" {
  count  = length(var.transits) > 0 ? 1 : 0
  name   = "PROTECT-RE"
  family = "inet"

  term {
    name = "mgmt-trusted"
    from {
      source_address   = var.mgmt_trusted_sources
      protocol         = ["tcp"]
      destination_port = ["22", "830"]
    }
    then {
      action = "accept"
    }
  }
  term {
    name = "mgmt-drop"
    from {
      protocol         = ["tcp"]
      destination_port = ["22", "830"]
    }
    then {
      action = "discard"
    }
  }
  term {
    name = "bgp-trusted"
    from {
      source_address   = local.bgp_trusted_v4
      protocol         = ["tcp"]
      destination_port = ["179"]
    }
    then {
      action = "accept"
    }
  }
  term {
    name = "bgp-drop"
    from {
      protocol         = ["tcp"]
      destination_port = ["179"]
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

resource "junos_firewall_filter" "protect_re6" {
  count  = length(var.transits) > 0 ? 1 : 0
  name   = "PROTECT-RE6"
  family = "inet6"

  term {
    name = "mgmt-drop"
    from {
      next_header      = ["tcp"]
      destination_port = ["22", "830"]
    }
    then {
      action = "discard"
    }
  }
  # v6 BGP: only the transit peers speak it (the node iBGP is v4-only). Omit the
  # accept term entirely if there are somehow no v6 peers, so we never emit an
  # empty source-address match (which would accept from anywhere).
  dynamic "term" {
    for_each = length(local.bgp_trusted_v6) > 0 ? [1] : []
    content {
      name = "bgp-trusted"
      from {
        source_address   = local.bgp_trusted_v6
        next_header      = ["tcp"]
        destination_port = ["179"]
      }
      then {
        action = "accept"
      }
    }
  }
  term {
    name = "bgp-drop"
    from {
      next_header      = ["tcp"]
      destination_port = ["179"]
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
