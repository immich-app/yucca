# Control-plane (RE) protection filters, bound on lo0 (see interfaces.tf). Restrict
# management (SSH 22 / NETCONF 830) to trusted sources and drop it everywhere else
# (incl. the transit), while accepting all other RE-bound traffic. Generated when
# transit is configured (the spine then has Internet adjacency).
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
  term {
    name = "default"
    then {
      action = "accept"
    }
  }
}
