# ── Cilium node iBGP + the kube-VLAN IRB (LoadBalancer VIPs, north-south) ─────
# The spine's ONLY IRB: irb.<kube_vlan> is the VLAN-10 gateway AND the iBGP peer
# address. Cilium speakers on the workers peer here (same AS as the core) and advertise
# LoadBalancer /32s; the core forwards each VIP to the advertising worker. VIPs inside
# the transit-advertised aggregate are reachable north-south with no extra policy.
#
# SINGLE SOURCE OF TRUTH: peering is by SUBNET (dynamic `allow` over var.node_bgp
# .peer_range = the kube CIDR from the addressing module) — the worker IPs live only in
# the cluster definition, never duplicated here. The import accepts local.advertised
# (what the transits already originate), so the concrete LB pool ranges live ONLY in the
# Cilium CiliumLoadBalancerIPPools. The vlan's l3-interface is set in vlans.tf.

locals {
  # The spine's kube gateway = .1 of the kube net, kept at the net's prefix length.
  kube_irb_address = var.node_bgp == null ? null : "${cidrhost(var.node_bgp.peer_range, 1)}/${split("/", var.node_bgp.peer_range)[1]}"
  # Per-unit inet MTU for the routed IRB gateways = physical 9216 − 14 (L2
  # header). Above the hosts' 9000, so jumbo pod traffic routes cross-VLAN
  # unfragmented. Set explicitly (see interfaces.tf irb_jumbo).
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

# Accept the advertised aggregate(s) and longer (the LB /32s); reject anything else.
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

# ECMP across the workers for the LB /32s. Two halves, both required on Junos:
# `multipath` on the group (bgp-nodes below) keeps every worker's equal path in
# the RIB, and this forwarding-table export installs them all in the PFE with
# per-FLOW hashing (Junos calls it "per-packet"; QFX hashes 5-tuples, so a TCP
# stream stays on one worker). Without it the spine forwards every VIP to a
# single worker and one node's uplink caps the whole ingress. Note the export
# is chassis-global: any other equal-cost route set also starts load-balancing,
# which is the desired behavior. Wired into routing-options in transit.tf.
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

# The node iBGP group, dynamic-peered over the kube subnet (`allow`). Raw set-config:
# dynamic neighbors aren't a typed jeremmfr attribute. Depends on the policies it refs.
# Per-worker egress return routes: replies to a worker's public egress /32 land on the
# core (transit /24) and must be forwarded to that specific worker. Static because the
# workers are fixed bare metal; the egress IPs aren't Cilium services so BGP won't carry
# them. See var.node_egress.
resource "junos_static_route" "node_egress" {
  for_each    = var.node_egress
  destination = "${each.value}/32"
  next_hop    = [each.key]
}

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

