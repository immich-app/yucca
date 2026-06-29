locals {
  # Per-cluster networks carry an IRB gateway on the leaf; site-global are L2 only.
  cluster_vlans = {
    "vlan${var.public_vlan_id}"  = { id = var.public_vlan_id, l3 = "irb.${var.public_vlan_id}" }
    "vlan${var.private_vlan_id}" = { id = var.private_vlan_id, l3 = "irb.${var.private_vlan_id}" }
    "vlan${var.api_vlan_id}"     = { id = var.api_vlan_id, l3 = null }
    "vlan${var.mgmt_vlan_id}"    = { id = var.mgmt_vlan_id, l3 = null }
  }
}

resource "junos_vlan" "this" {
  for_each     = local.cluster_vlans
  name         = each.key
  vlan_id      = tostring(each.value.id)
  l3_interface = each.value.l3
}
