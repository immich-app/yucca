# Storm-control profile referenced by the uplink trunk + LLDP on all interfaces.
resource "junos_forwardingoptions_storm_control_profile" "default" {
  name = "default"
  all {
    bandwidth_level = 10000
  }
}

resource "junos_lldp_interface" "all" {
  name = "all"
}
