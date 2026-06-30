locals {
  # Per-cluster networks carry an IRB gateway on the leaf; site-global are L2 only.
  cluster_vlans = {
    "vlan${var.public_vlan_id}"    = { id = var.public_vlan_id, l3 = "irb.${var.public_vlan_id}" }
    "vlan${var.private_vlan_id}"   = { id = var.private_vlan_id, l3 = "irb.${var.private_vlan_id}" }
    "vlan${var.host_mgmt_vlan_id}" = { id = var.host_mgmt_vlan_id, l3 = "irb.${var.host_mgmt_vlan_id}" }
    "vlan${var.api_vlan_id}"       = { id = var.api_vlan_id, l3 = null }
    "vlan${var.mgmt_vlan_id}"      = { id = var.mgmt_vlan_id, l3 = null }
  }
}

resource "junos_vlan" "this" {
  for_each     = local.cluster_vlans
  name         = each.key
  vlan_id      = tostring(each.value.id)
  l3_interface = each.value.l3

  # jeremmfr commits per-resource: an l3_interface vlan is rejected if its IRB
  # unit isn't on the box yet, so create the IRBs first.
  depends_on = [
    junos_interface_logical.irb_public,
    junos_interface_logical.irb_private,
    junos_interface_logical.irb_host_mgmt,
  ]
}
