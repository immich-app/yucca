# NetBird internal DNS — the yucca.internal zone + per-cluster A records, resolved
# by every NetBird peer in the distribution groups. Names follow the
# REVERSE-HOSTNAME scheme: <service>.<cluster>.<region>.<provider>.yucca.internal
# (the node hostname convention yucca-<provider>-<region>-<cluster>-… reversed into
# DNS hierarchy).
#
# The father API endpoint resolves to the PRIVATE LB IP (kube-cp .5 = 10.40.11.5),
# reachable over the yucca-fsn-father-kube-cp route (the CPs are the route peers).
#
# NB: yucca.internal is account-wide but lives here for now (only site using it).
# Move the zone to a shared/global netbird stack if a second site needs it.
resource "netbird_dns_zone" "yucca_internal" {
  name                 = "yucca-internal"
  domain               = "yucca.internal"
  enabled              = true
  enable_search_domain = false
  distribution_groups = [
    module.netbird.group_ids["talos"],
    module.netbird.group_ids["mgmt"],
    module.netbird.group_ids["ci"],
    module.netbird.group_ids["k8s_operator"],
  ]
}

resource "netbird_dns_record" "father_kube_api" {
  zone_id = netbird_dns_zone.yucca_internal.id
  name    = "kube.father.${var.region_code}.${var.provider_code}.yucca.internal"
  type    = "A"
  content = cidrhost(module.addr_site.kube_cp_cidr, 5) # 10.40.11.5 — private API LB
  ttl     = 300
}

output "kube_api_fqdn" {
  description = "father API endpoint FQDN — NetBird peers resolve it to the private LB."
  value       = netbird_dns_record.father_kube_api.name
}
