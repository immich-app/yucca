locals {
  # The master chassis only — it carries the VC's vme IP.
  mgmt_devices = { for name, d in var.devices : name => d if d.mgmt_ip != null }
}

resource "netbox_device" "this" {
  for_each       = var.devices
  name           = each.key
  site_id        = data.netbox_site.this.id
  role_id        = netbox_device_role.this[each.value.role].id
  device_type_id = netbox_device_type.this["${each.value.manufacturer}|${each.value.model}"].id
  serial         = each.value.serial
  status         = "active"
}

# vme = virtual management, on each VC master.
resource "netbox_device_interface" "vme" {
  for_each  = local.mgmt_devices
  device_id = netbox_device.this[each.key].id
  name      = "vme"
  type      = "virtual"
  mgmtonly  = true
}

resource "netbox_ip_address" "vme" {
  for_each            = local.mgmt_devices
  ip_address          = "${each.value.mgmt_ip}/${var.mgmt_prefixlen}"
  status              = "active"
  device_interface_id = netbox_device_interface.vme[each.key].id
  dns_name            = each.key
}
