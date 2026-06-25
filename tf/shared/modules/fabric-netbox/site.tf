locals {
  slug = { for s in distinct([for d in var.devices : d.manufacturer]) : s => lower(replace(s, "/[^0-9A-Za-z]+/", "-")) }

  manufacturers = toset([for d in var.devices : d.manufacturer])
  roles         = toset([for d in var.devices : d.role])
  device_types = {
    for k in distinct([for d in var.devices : "${d.manufacturer}|${d.model}"]) :
    k => { manufacturer = split("|", k)[0], model = split("|", k)[1] }
  }
}

# The site is shared infra (it also holds non-fabric prefixes), so reference the
# existing one rather than own/recreate it. Create it once out-of-band if missing.
data "netbox_site" "this" {
  slug = var.site.slug
}

resource "netbox_manufacturer" "this" {
  for_each = local.manufacturers
  name     = each.value
  slug     = local.slug[each.value]
}

resource "netbox_device_role" "this" {
  for_each  = local.roles
  name      = title(each.value)
  slug      = each.value
  color_hex = lookup(var.role_colors, each.value, "9e9e9e")
}

resource "netbox_device_type" "this" {
  for_each        = local.device_types
  manufacturer_id = netbox_manufacturer.this[each.value.manufacturer].id
  model           = each.value.model
  slug            = lower(replace(each.value.model, "/[^0-9A-Za-z]+/", "-"))
  part_number     = each.value.model
}
