# NetBox — creates the whole fabric representation: the site, manufacturers/roles/
# device-types, the switch chassis (spine pair + each cluster's leaf pair, with vme
# mgmt IPs), VLANs, prefixes, and gateway IPs — all from the addressing module.
module "netbox" {
  source = "../../../shared/modules/fabric-netbox"

  site = {
    name = var.netbox_site_name
    slug = var.netbox_site_slug
    code = var.site_code
  }

  site_supernet = module.addr_site.site_supernet

  # Site-global VLANs (present on every cluster).
  global_vlans = {
    MGMT = { vid = module.addr_site.mgmt_vlan_id, prefix = module.addr_site.mgmt_cidr }
    API  = { vid = module.addr_site.api_vlan_id, prefix = module.addr_site.api_cidr }
  }

  clusters = {
    "1" = {
      cluster_supernet = module.addr_cls1.cluster_supernet
      public_cidr      = module.addr_cls1.public_cidr
      private_cidr     = module.addr_cls1.private_cidr
      public_vlan_id   = module.addr_cls1.public_vlan_id
      private_vlan_id  = module.addr_cls1.private_vlan_id
      public_gateway   = module.addr_cls1.public_gateway
      private_gateway  = module.addr_cls1.private_gateway
    }
  }

  devices = {
    # Spine VC (shared site core) — member 0 carries the vme.
    "${var.netbox_site_slug}-corenetsw-1" = {
      role   = "spine", manufacturer = "Juniper Networks", model = "QFX5200-32C-32Q"
      serial = var.spine_vc_serials[0], mgmt_ip = module.addr_site.spine_mgmt_ip
    }
    "${var.netbox_site_slug}-corenetsw-2" = {
      role   = "spine", manufacturer = "Juniper Networks", model = "QFX5200-32C-32Q"
      serial = var.spine_vc_serials[1]
    }
    # cls1 leaf VC — member 0 carries the vme.
    "${var.netbox_site_slug}-cls1netsw-1" = {
      role   = "leaf", manufacturer = "Juniper Networks", model = "QFX5120-48Y-8C"
      serial = var.cls1_leaf_serials[0], mgmt_ip = module.addr_cls1.leaf_mgmt_ip
    }
    "${var.netbox_site_slug}-cls1netsw-2" = {
      role   = "leaf", manufacturer = "Juniper Networks", model = "QFX5120-48Y-8C"
      serial = var.cls1_leaf_serials[1]
    }
  }
}
