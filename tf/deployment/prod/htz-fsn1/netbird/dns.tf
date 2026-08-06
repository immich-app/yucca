# The zone is account-wide but lives here (only site using it); move to a
# global netbird stack if a second site needs it.

data "netbird_group" "yucca" {
  name = "yucca"
}

resource "netbird_dns_zone" "yucca_internal" {
  name                 = "yucca-futo-network"
  domain               = "yucca.futo.network"
  enabled              = true
  enable_search_domain = false
  distribution_groups = [
    data.netbird_group.yucca.id, # human operators
    module.netbird.group_ids["talos"],
    module.netbird.group_ids["mgmt"],
    module.netbird.group_ids["ci"],
    # k8s_operator removed; re-add with the service user/token when the
    # in-cluster operator deploys.
  ]
}

locals {
  father_cps           = var.talos_discovery_enabled ? local.talos_kube.cp_nodes : {}
  father_kube_api_fqdn = "kube.${local.cluster_name}.${var.region_code}.${var.provider_code}.yucca.futo.network"
}

resource "netbird_dns_record" "father_cp" {
  for_each = local.father_cps
  zone_id  = netbird_dns_zone.yucca_internal.id
  name     = "${each.key}.k8s.father.${var.region_code}.${var.provider_code}.yucca.futo.network"
  type     = "A"
  content  = each.value
  ttl      = 300
}

# Netops records → internal LB VIPs (lb_internal, NetBird-only). VIPs are pinned
# via io.cilium/lb-ipam-ips in kubernetes/apps/prod/htz-fsn1/netops/ and MUST
# agree with these.
locals {
  # All netops names → the TLS proxy VIP (netops/tls-proxy.yaml, Host-routed);
  # per-service VIPs .10-.15 still exist for plain-HTTP debugging, not in DNS.
  father_netops = {
    grafana   = cidrhost(module.addr_site.lb_internal_cidr, 16)
    lg        = cidrhost(module.addr_site.lb_internal_cidr, 16)
    smokeping = cidrhost(module.addr_site.lb_internal_cidr, 16)
    oxidized  = cidrhost(module.addr_site.lb_internal_cidr, 16)
    sflow     = cidrhost(module.addr_site.lb_internal_cidr, 16)
    hubble    = cidrhost(module.addr_site.lb_internal_cidr, 16)
    admin = cidrhost(module.addr_site.lb_internal_cidr, 16)
    # michael internal gateway VIP — second IP on the gw envoy Service (gw-proxy/);
    # the public VIP aggregate isn't routed inside Hetzner.
    gw = cidrhost(module.addr_site.lb_internal_cidr, 17)
  }
}

resource "netbird_dns_record" "father_netops" {
  for_each = local.father_netops
  zone_id  = netbird_dns_zone.yucca_internal.id
  name     = "${each.key}.father.${var.region_code}.${var.provider_code}.yucca.futo.network"
  type     = "A"
  content  = each.value
  ttl      = 300
}

# Worker records → NetBird mesh IP (fabric IPs are only reachable via the mgmt
# route). Peer IPs looked up live; a re-provisioned worker gets a new mesh IP,
# refreshed on the next apply.
locals {
  father_workers = var.talos_discovery_enabled ? keys(local.talos_kube.worker_nodes) : []
}

data "netbird_peer" "father_worker" {
  for_each = toset(local.father_workers)
  name     = "yucca-${var.provider_code}-${var.region_code}-${local.cluster_name}-k8s-${each.key}"
}

resource "netbird_dns_record" "father_worker" {
  for_each = data.netbird_peer.father_worker
  zone_id  = netbird_dns_zone.yucca_internal.id
  name     = "${each.key}.k8s.father.${var.region_code}.${var.provider_code}.yucca.futo.network"
  type     = "A"
  content  = each.value.ip
  ttl      = 300
}

# Reachable over the yucca-fsn-father-kube-cp route.
resource "netbird_dns_record" "father_kube_api" {
  count   = var.talos_discovery_enabled ? 1 : 0
  zone_id = netbird_dns_zone.yucca_internal.id
  name    = local.father_kube_api_fqdn
  type    = "A"
  content = local.talos_kube.api_vip
  ttl     = 300
}

output "kube_api_fqdn" {
  description = "father API endpoint FQDN — NetBird peers resolve it (round-robin) to the CPs."
  value       = local.father_kube_api_fqdn
}
