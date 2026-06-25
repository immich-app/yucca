locals {
  # 100G->4x25G breakout on the server-facing ports of both VC members.
  chassis_block = [{
    aggregated_devices = [{ ethernet = [{ device_count = var.aggregated_device_count }] }]
    fpc = [
      for fpc in [0, 1] : {
        name = fpc
        pic  = [{ name = 0, port = [for p in var.breakout_ports : { name = p, channel_speed = var.breakout_speed }] }]
      }
    ]
  }]
}
