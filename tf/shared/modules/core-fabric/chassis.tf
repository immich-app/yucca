# Preprovisioned spine VC + the per-port breakout channelization. Breakout
# (channel-speed) has no typed jeremmfr resource, so it's pushed as raw set-config.
# The `aggregated-devices ethernet device-count` line is auto-managed by
# junos_interface_physical (computed from the ae interfaces) — not set here.
resource "junos_virtual_chassis" "spine" {
  preprovisioned = true

  dynamic "member" {
    for_each = var.vc_member_serials
    content {
      id            = member.key
      role          = "routing-engine"
      serial_number = member.value
    }
  }
}

resource "junos_null_load_config" "breakout" {
  action = "set"
  config = join("\n", flatten([
    for fpc in [0, 1] : [
      for p, speed in var.breakout_ports :
      "set chassis fpc ${fpc} pic 0 port ${p} channel-speed ${speed}"
    ]
  ]))
}
