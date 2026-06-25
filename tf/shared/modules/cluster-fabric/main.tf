# Assembles the single JTAF config resource for the cluster leaf VC from the
# generated sections (vlans.tf / interfaces.tf / firewall.tf / chassis.tf /
# system.tf). The provider is the cluster's aliased junos-qfx, passed by the stack.
resource "terraform-provider-junos-qfx" "cluster" {
  resource_name = "fabric"
  provider      = junos-qfx

  chassis            = local.chassis_block
  interfaces         = local.interfaces_block
  forwarding_options = local.forwarding_options_block
  firewall           = local.firewall_block
  protocols          = local.protocols_block
  virtual_chassis    = local.virtual_chassis_block
  vlans              = local.vlans_block
}
