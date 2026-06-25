locals {
  # Server ports run at 25G. Speed is set per quad (the quad leader at 0,4,8,...),
  # on both VC members.
  chassis_block = [{
    aggregated_devices = [{ ethernet = [{ device_count = var.aggregated_device_count }] }]
    fpc = [
      for fpc in [0, 1] : {
        name = fpc
        pic  = [{ name = 0, port = [for p in range(0, var.server_lag_count, 4) : { name = p, speed = "25g" }] }]
      }
    ]
  }]
}
