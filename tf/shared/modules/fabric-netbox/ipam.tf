locals {
  # Per-network rows (public/private of each cluster) for VLANs + prefixes + gateways.
  networks = merge([
    for cid, c in var.clusters : {
      "${cid}-public"  = { vid = c.public_vlan_id, role = "PUBLIC", prefix = c.public_cidr, gateway = c.public_gateway }
      "${cid}-private" = { vid = c.private_vlan_id, role = "PRIVATE", prefix = c.private_cidr, gateway = c.private_gateway }
    }
  ]...)
}

# ── Container prefixes ──────────────────────────────────────────────────────
resource "netbox_prefix" "site" {
  prefix      = var.site_supernet
  status      = "container"
  site_id     = netbox_site.this.id
  description = "${var.site.code} site supernet"
}

resource "netbox_prefix" "mgmt" {
  prefix      = var.mgmt_cidr
  status      = "active"
  site_id     = netbox_site.this.id
  description = "${var.site.code} OOB/vme management"
}

resource "netbox_prefix" "cluster_supernet" {
  for_each    = var.clusters
  prefix      = each.value.cluster_supernet
  status      = "container"
  site_id     = netbox_site.this.id
  description = "${var.site.code} cluster ${each.key} supernet"
}

# ── Cluster VLANs + their network prefixes + gateway IPs ────────────────────
resource "netbox_vlan" "this" {
  for_each = local.networks
  name     = "${var.site.code}-C${split("-", each.key)[0]}-${each.value.role}"
  vid      = each.value.vid
  site_id  = netbox_site.this.id
}

resource "netbox_prefix" "network" {
  for_each    = local.networks
  prefix      = each.value.prefix
  status      = "active"
  vlan_id     = netbox_vlan.this[each.key].id
  site_id     = netbox_site.this.id
  description = "${var.site.code}-C${split("-", each.key)[0]}-${each.value.role}"
}

resource "netbox_ip_address" "gateway" {
  for_each    = local.networks
  ip_address  = "${each.value.gateway}/${split("/", each.value.prefix)[1]}"
  status      = "active"
  dns_name    = "gw-${var.site.code}-C${split("-", each.key)[0]}-${lower(each.value.role)}"
  description = "IRB gateway for ${var.site.code}-C${split("-", each.key)[0]}-${each.value.role}"
}
