# L2-only on the spine except kube (IRB in bgp-nodes.tf) and kube-cp; all other
# gateways live on the leaves.
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

# Spine is the .1 gateway; worker↔CP routes irb.<kube>↔irb.<kube-cp>.
resource "junos_interface_logical" "kube_cp_irb" {
  count = var.kube_cp == null ? 0 : 1
  name  = "irb.${var.kube_cp.vlan_id}"
  family_inet {
    mtu = local.irb_unit_mtu # jumbo routed gateway (see bgp-nodes.tf / interfaces.tf)
    address { cidr_ip = "${cidrhost(var.kube_cp.cidr, 1)}/${split("/", var.kube_cp.cidr)[1]}" }
  }
}

# NOT the .1 gateway (that's the leaf): a second L3 presence so the spine routes
# kube↔cls-public (workers' RGW path); public hosts route the kube net back via
# this address.
resource "junos_interface_logical" "public_irb" {
  count = var.public_routing == null ? 0 : 1
  name  = "irb.${var.public_vlan_id}"
  family_inet {
    address { cidr_ip = var.public_routing.ip }
  }
}
