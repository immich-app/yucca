# Preprovisioned leaf VC + per-quad 25G port speed (set on the quad leader
# 0,4,8,... on both members). Speed has no typed resource, so it's raw set-config.
# device-count is auto-managed by junos_interface_physical.
resource "junos_virtual_chassis" "leaf" {
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

resource "junos_null_load_config" "port_speed" {
  action = "set"
  config = join("\n", flatten([
    for fpc in [0, 1] : [
      for p in range(0, var.server_lag_count, 4) :
      "set chassis fpc ${fpc} pic 0 port ${p} speed 25g"
    ]
  ]))
}
