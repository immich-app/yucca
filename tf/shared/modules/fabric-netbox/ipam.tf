locals {
  site_id = data.netbox_site.this.id

  # Per-cluster networks (public/private/host-mgmt) for VLANs + prefixes + gateways.
  networks = merge([
    for cid, c in var.clusters : {
      "${cid}-public"    = { vid = c.public_vlan_id, role = "PUBLIC", prefix = c.public_cidr, gateway = c.public_gateway }
      "${cid}-private"   = { vid = c.private_vlan_id, role = "PRIVATE", prefix = c.private_cidr, gateway = c.private_gateway }
      "${cid}-host_mgmt" = { vid = c.host_mgmt_vlan_id, role = "HOST-MGMT", prefix = c.host_mgmt_cidr, gateway = c.host_mgmt_gateway }
    }
  ]...)
}

# ── Site container ──────────────────────────────────────────────────────────
resource "netbox_prefix" "site" {
  prefix      = var.site_supernet
  status      = "container"
  site_id     = local.site_id
  description = "${var.site.code} site supernet"
}

# ── Site-global VLANs (mgmt, api) + their prefixes ──────────────────────────
resource "netbox_vlan" "global" {
  for_each = var.global_vlans
  name     = "${var.site.code}-${each.key}"
  vid      = each.value.vid
  site_id  = local.site_id
}

resource "netbox_prefix" "global" {
  for_each    = var.global_vlans
  prefix      = each.value.prefix
  status      = "active"
  vlan_id     = netbox_vlan.global[each.key].id
  site_id     = local.site_id
  description = "${var.site.code}-${each.key}"
}

# ── Per-cluster supernets, VLANs, network prefixes, gateway IPs ─────────────
resource "netbox_prefix" "cluster_supernet" {
  for_each    = var.clusters
  prefix      = each.value.cluster_supernet
  status      = "container"
  site_id     = local.site_id
  description = "${var.site.code} cluster ${each.key} supernet"
}

resource "netbox_vlan" "this" {
  for_each = local.networks
  name     = "${var.site.code}-C${split("-", each.key)[0]}-${each.value.role}"
  vid      = each.value.vid
  site_id  = local.site_id
}

resource "netbox_prefix" "network" {
  for_each    = local.networks
  prefix      = each.value.prefix
  status      = "active"
  vlan_id     = netbox_vlan.this[each.key].id
  site_id     = local.site_id
  description = "${var.site.code}-C${split("-", each.key)[0]}-${each.value.role}"
}

resource "netbox_ip_address" "gateway" {
  for_each    = local.networks
  ip_address  = "${each.value.gateway}/${split("/", each.value.prefix)[1]}"
  status      = "active"
  dns_name    = "gw-${var.site.code}-C${split("-", each.key)[0]}-${lower(each.value.role)}"
  description = "IRB gateway for ${var.site.code}-C${split("-", each.key)[0]}-${each.value.role}"
}
