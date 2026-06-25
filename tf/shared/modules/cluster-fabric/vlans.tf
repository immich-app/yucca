locals {
  public_vlan_name  = "vlan${var.public_vlan_id}"
  private_vlan_name = "vlan${var.private_vlan_id}"

  vlans_block = [{
    vlan = [
      {
        name         = local.public_vlan_name
        vlan_id      = var.public_vlan_id
        l3_interface = "irb.${var.public_vlan_id}"
      },
      {
        name         = local.private_vlan_name
        vlan_id      = var.private_vlan_id
        l3_interface = "irb.${var.private_vlan_id}"
      },
    ]
  }]
}
