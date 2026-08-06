# Peering is by SUBNET (dynamic `allow` over peer_range) — worker IPs live only
# in the cluster definition; concrete LB pool ranges live only in the Cilium
# LoadBalancerIPPools.

locals {
  kube_irb_address = var.node_bgp == null ? null : "${cidrhost(var.node_bgp.peer_range, 1)}/${split("/", var.node_bgp.peer_range)[1]}"
  # 9216 − 14 (L2 header); above the hosts' 9000 so jumbo routes cross-VLAN
  # unfragmented. Set explicitly (interfaces.tf irb_jumbo).
  irb_unit_mtu = 9202
}

resource "junos_interface_logical" "kube_irb" {
  count = var.node_bgp == null ? 0 : 1
  name  = "irb.${var.kube_vlan_id}"
  family_inet {
    mtu = local.irb_unit_mtu
    address { cidr_ip = local.kube_irb_address }
  }
}

resource "junos_policyoptions_policy_statement" "nodes_in" {
  count = var.node_bgp == null ? 0 : 1
  name  = "CILIUM-NODES-IN"
  term {
    name = "advertised-space"
    from {
      dynamic "route_filter" {
        for_each = setunion(local.advertised, var.node_bgp.accept_prefixes)
        content {
          route  = route_filter.value
          option = "orlonger"
        }
      }
    }
    then {
      action = "accept"
    }
  }
  term {
    name = "reject-rest"
    then {
      action = "reject"
    }
  }
}

resource "junos_policyoptions_policy_statement" "reject_all" {
  count = var.node_bgp == null ? 0 : 1
  name  = "REJECT-ALL"
  term {
    name = "reject"
    then {
      action = "reject"
    }
  }
}

# ECMP for the LB /32s — both halves required on Junos: group `multipath` keeps
# equal paths in the RIB; this forwarding-table export installs them in the PFE
# with per-FLOW hashing ("per-packet" = 5-tuple on QFX). Without it one worker's
# uplink caps all ingress. Export is chassis-global (desired). Wired in transit.tf.
resource "junos_policyoptions_policy_statement" "ecmp_lb" {
  count = var.node_bgp == null ? 0 : 1
  name  = "ECMP-LOAD-BALANCE"
  term {
    name = "load-balance"
    then {
      load_balance = "per-packet"
    }
  }
}

# Per-worker egress return routes: replies to a worker's public egress /32 must
# reach that worker; static because the egress IPs aren't Cilium services (BGP
# won't carry them).
resource "junos_static_route" "node_egress" {
  for_each    = var.node_egress
  destination = "${each.value}/32"
  next_hop    = [each.key]
}

# Raw set-config: dynamic neighbors aren't a typed jeremmfr attribute.
resource "junos_null_load_config" "node_bgp" {
  count      = var.node_bgp == null ? 0 : 1
  depends_on = [junos_policyoptions_policy_statement.nodes_in, junos_policyoptions_policy_statement.reject_all]
  action     = "set"
  config = join("\n", [
    "set protocols bgp group cilium-nodes type internal",
    "set protocols bgp group cilium-nodes allow ${var.node_bgp.peer_range}",
    "set protocols bgp group cilium-nodes family inet unicast",
    "set protocols bgp group cilium-nodes import CILIUM-NODES-IN",
    "set protocols bgp group cilium-nodes export REJECT-ALL",
    "set protocols bgp group cilium-nodes multipath",
  ])
}

