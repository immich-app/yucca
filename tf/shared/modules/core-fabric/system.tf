# Switch-wide bits: the storm-control profile referenced by the ae0 trunk, and
# LLDP on all interfaces. (system login + name-servers live in fabric-login.)
resource "junos_forwardingoptions_storm_control_profile" "default" {
  name = "default"
  all {
    bandwidth_level = 10000
  }
}

resource "junos_lldp_interface" "all" {
  name = "all"
}
