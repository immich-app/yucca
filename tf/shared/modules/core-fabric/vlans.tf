locals {
  # Stretched VLANs (L2 only on the spine — gateways live on the leaves / elsewhere).
  # Per-cluster public/private + the site-global api/mgmt.
  vlans_block = [{
    vlan = [
      { name = "vlan${var.public_vlan_id}", vlan_id = var.public_vlan_id },
      { name = "vlan${var.private_vlan_id}", vlan_id = var.private_vlan_id },
      { name = "vlan${var.api_vlan_id}", vlan_id = var.api_vlan_id },
      { name = "vlan${var.mgmt_vlan_id}", vlan_id = var.mgmt_vlan_id },
    ]
  }]
}
