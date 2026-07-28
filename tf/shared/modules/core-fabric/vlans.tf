# Stretched VLANs — L2 only on the spine EXCEPT the kube VLAN (IRB when node_bgp
# is set: the Cilium iBGP peer + VLAN-10 gateway, see bgp-nodes.tf) and the
# kube-cp VLAN (IRB when kube_cp is set: the CPs' gateway — the spine routes
# kube↔kube-cp). Other gateways live on the leaves.
locals {
  spine_vlans = merge({
    "vlan${var.public_vlan_id}"    = { id = var.public_vlan_id, l3 = var.public_routing == null ? null : "irb.${var.public_vlan_id}" }
    "vlan${var.private_vlan_id}"   = { id = var.private_vlan_id, l3 = null }
    "vlan${var.kube_vlan_id}"      = { id = var.kube_vlan_id, l3 = var.node_bgp == null ? null : "irb.${var.kube_vlan_id}" }
    "vlan${var.mgmt_vlan_id}"      = { id = var.mgmt_vlan_id, l3 = null }
    "vlan${var.host_mgmt_vlan_id}" = { id = var.host_mgmt_vlan_id, l3 = null }
    }, var.kube_cp == null ? {} : {
    "vlan${var.kube_cp.vlan_id}" = { id = var.kube_cp.vlan_id, l3 = "irb.${var.kube_cp.vlan_id}" }
  })
}

resource "junos_vlan" "this" {
  for_each     = local.spine_vlans
  name         = each.key
  vlan_id      = tostring(each.value.id)
  l3_interface = each.value.l3
}

# kube-cp IRB — the spine is the kube-cp gateway (.1). Bare-metal CPs sit on this
# VLAN only; worker↔CP (kubelet↔apiserver, geneve) routes irb.<kube>↔irb.<kube-cp>.
resource "junos_interface_logical" "kube_cp_irb" {
  count = var.kube_cp == null ? 0 : 1
  name  = "irb.${var.kube_cp.vlan_id}"
  family_inet {
    mtu = local.irb_unit_mtu # jumbo routed gateway (see bgp-nodes.tf / interfaces.tf)
    address { cidr_ip = "${cidrhost(var.kube_cp.cidr, 1)}/${split("/", var.kube_cp.cidr)[1]}" }
  }
}

# Public-VLAN IRB — NOT the .1 gateway (that's the leaf); a second L3 presence
# so the spine routes kube↔cls-public for the workers' RGW path. Public-VLAN
# hosts route the kube net back via this address.
resource "junos_interface_logical" "public_irb" {
  count = var.public_routing == null ? 0 : 1
  name  = "irb.${var.public_vlan_id}"
  family_inet {
    address { cidr_ip = var.public_routing.ip }
  }
}
