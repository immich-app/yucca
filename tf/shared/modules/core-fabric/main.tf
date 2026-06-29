# Assembles the single JTAF config resource for the spine VC from the generated
# sections (chassis.tf breakout, vlans.tf stretch, system.tf) and the bespoke
# interfaces (interfaces.tf). Provider = the spine's aliased junos-qfx.
resource "terraform-provider-junos-qfx" "core" {
  resource_name = "fabric"
  provider      = junos-qfx

  chassis            = local.chassis_block
  interfaces         = local.interfaces_block
  forwarding_options = local.forwarding_options_block
  routing_options    = local.routing_options_block
  protocols          = local.protocols_block
  policy_options     = local.transit_policy_options
  system             = local.system_block
  virtual_chassis    = local.virtual_chassis_block
  vlans              = local.vlans_block
}
