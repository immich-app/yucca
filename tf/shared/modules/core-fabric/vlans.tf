# Stretched VLANs (L2 only on the spine — gateways live on the leaves / elsewhere).
locals {
  spine_vlans = {
    "vlan${var.public_vlan_id}"  = var.public_vlan_id
    "vlan${var.private_vlan_id}" = var.private_vlan_id
    "vlan${var.api_vlan_id}"     = var.api_vlan_id
    "vlan${var.mgmt_vlan_id}"    = var.mgmt_vlan_id
  }
}

resource "junos_vlan" "this" {
  for_each = local.spine_vlans
  name     = each.key
  vlan_id  = tostring(each.value)
}
