locals {
  public_vlan_name  = "vlan${var.public_vlan_id}"
  private_vlan_name = "vlan${var.private_vlan_id}"
  api_vlan_name     = "vlan${var.api_vlan_id}"
  mgmt_vlan_name    = "vlan${var.mgmt_vlan_id}"

  vlans_block = [{
    vlan = [
      # Per-cluster networks — gateways (IRB) live here on the leaf.
      { name = local.public_vlan_name, vlan_id = var.public_vlan_id, l3_interface = "irb.${var.public_vlan_id}" },
      { name = local.private_vlan_name, vlan_id = var.private_vlan_id, l3_interface = "irb.${var.private_vlan_id}" },
      # Site-global networks — L2 only on the leaf (no IRB; gateway is elsewhere).
      { name = local.api_vlan_name, vlan_id = var.api_vlan_id },
      { name = local.mgmt_vlan_name, vlan_id = var.mgmt_vlan_id },
    ]
  }]
}
