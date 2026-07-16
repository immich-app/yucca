# NetBird internal DNS — the yucca.futo.network zone + per-cluster A records, resolved
# by every NetBird peer in the distribution groups. Names follow the
# REVERSE-HOSTNAME scheme: <thing>.<cluster>.<region>.<provider>.yucca.futo.network
# (the node hostname convention yucca-<provider>-<region>-<cluster>-… reversed into
# DNS hierarchy).
#
# NB: yucca.futo.network is account-wide but lives here for now (only site using it).
# Move the zone to a shared/global netbird stack if a second site needs it.

# The account-wide "yucca" users group (operators). Looked up so operators resolve
# the zone. Site node groups get it via distribution too.
data "netbird_group" "yucca" {
  name = "yucca"
}

resource "netbird_dns_zone" "yucca_internal" {
  name                 = "yucca-futo-network"
  domain               = "yucca.futo.network"
  enabled              = true
  enable_search_domain = false
  distribution_groups = [
    data.netbird_group.yucca.id, # operators (bigmac, etc.)
    module.netbird.group_ids["talos"],
    module.netbird.group_ids["mgmt"],
    module.netbird.group_ids["ci"],
    # (k8s_operator removed with the rest of its half-wiring — re-add alongside
    # the service user/token when the in-cluster operator deploys.)
  ]
}

locals {
  # Node names + IPs come from the talos stack's DISCOVERY output (see
  # talos-discovery.tf) — single source of truth, nothing hardcoded here.
  father_cps           = var.talos_discovery_enabled ? local.talos_kube.cp_nodes : {}
  father_kube_api_fqdn = "kube.${local.cluster_name}.${var.region_code}.${var.provider_code}.yucca.futo.network"
}

# Per-CP host records: <node>.k8s.father.<region>.<provider>.yucca.futo.network → kube-cp IP.
resource "netbird_dns_record" "father_cp" {
  for_each = local.father_cps
  zone_id  = netbird_dns_zone.yucca_internal.id
  name     = "${each.key}.k8s.father.${var.region_code}.${var.provider_code}.yucca.futo.network"
  type     = "A"
  content  = each.value
  ttl      = 300
}

# Netops service records — <svc>.father.<region>.<provider>.yucca.futo.network → the
# service's INTERNAL LoadBalancer VIP (lb_internal range, NetBird-only; VIPs are
# pinned via the io.cilium/lb-ipam-ips annotation in kubernetes/apps/prod/htz-fsn1/
# netops/, which must agree with these).
locals {
  # Every netops name resolves to the TLS proxy VIP (netops/tls-proxy.yaml —
  # wildcard cert, Host-routed). The per-service VIPs (.10-.15) still exist for
  # direct plain-HTTP access/debugging but are not in DNS.
  father_netops = {
    grafana   = cidrhost(module.addr_site.lb_internal_cidr, 16)
    lg        = cidrhost(module.addr_site.lb_internal_cidr, 16)
    smokeping = cidrhost(module.addr_site.lb_internal_cidr, 16)
    oxidized  = cidrhost(module.addr_site.lb_internal_cidr, 16)
    sflow     = cidrhost(module.addr_site.lb_internal_cidr, 16)
    hubble    = cidrhost(module.addr_site.lb_internal_cidr, 16)
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

# father worker node records: <node>.k8s.father.<region>.<provider>.yucca.futo.network →
# the worker's NetBird (mesh) IP — the address peers dial it on directly (the
# fabric IPs are only reachable via the mgmt route). Node names are the
# deterministic wordlist picks, like father_cps above. IPs are looked up live
# (data.netbird_peer; one live peer per node); a re-provisioned worker gets a new
# mesh IP, refreshed here on the next apply.
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

# API endpoint — the Talos-elected VIP on the kube-cp VLAN (etcd parks it on a
# healthy CP, so the record only answers where an apiserver runs). Reachable over
# the yucca-fsn-father-kube-cp route. (Historically round-robin over the CP IPs —
# the retired hcloud LB refused traffic from its own targets.)
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
