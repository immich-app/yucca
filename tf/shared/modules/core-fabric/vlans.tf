locals {
  # Stretched cluster VLANs (L2 only on the spine — gateways live on the leaf,
  # so no l3_interface here).
  vlans_block = [{
    vlan = [
      { name = "vlan${var.public_vlan_id}", vlan_id = var.public_vlan_id },
      { name = "vlan${var.private_vlan_id}", vlan_id = var.private_vlan_id },
    ]
  }]
}
