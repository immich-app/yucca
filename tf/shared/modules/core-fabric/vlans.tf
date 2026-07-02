# Stretched VLANs — L2 only on the spine EXCEPT the kube VLAN, which gets an IRB when
# node_bgp is set (the spine's only L3 interface, = the Cilium iBGP peer + VLAN-10
# gateway; see bgp-nodes.tf). Other gateways live on the leaves.
locals {
  spine_vlans = {
    "vlan${var.public_vlan_id}"    = { id = var.public_vlan_id, l3 = null }
    "vlan${var.private_vlan_id}"   = { id = var.private_vlan_id, l3 = null }
    "vlan${var.kube_vlan_id}"      = { id = var.kube_vlan_id, l3 = var.node_bgp == null ? null : "irb.${var.kube_vlan_id}" }
    "vlan${var.mgmt_vlan_id}"      = { id = var.mgmt_vlan_id, l3 = null }
    "vlan${var.host_mgmt_vlan_id}" = { id = var.host_mgmt_vlan_id, l3 = null }
  }
}

resource "junos_vlan" "this" {
  for_each     = local.spine_vlans
  name         = each.key
  vlan_id      = tostring(each.value.id)
  l3_interface = each.value.l3
}
