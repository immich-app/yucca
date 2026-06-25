locals {
  # Stop traffic routing between the cluster's public and private networks; the
  # IRBs apply this as an input filter. Default term accepts everything else.
  firewall_block = [{
    family = [{ inet = [{ filter = [{
      name = "NO-CROSS-VLAN"
      term = [
        {
          name = "block-public-to-private"
          from = [{ source_address = [{ name = var.public_cidr }], destination_address = [{ name = var.private_cidr }] }]
          then = [{ discard = [{}] }]
        },
        {
          name = "block-private-to-public"
          from = [{ source_address = [{ name = var.private_cidr }], destination_address = [{ name = var.public_cidr }] }]
          then = [{ discard = [{}] }]
        },
        {
          name = "default"
          then = [{ accept = "" }]
        },
      ]
    }] }] }]
  }]
}
