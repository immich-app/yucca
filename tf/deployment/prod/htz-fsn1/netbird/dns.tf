# NetBird internal DNS — the yucca.internal zone + per-cluster A records, resolved
# by every NetBird peer in the distribution groups. Names follow the
# REVERSE-HOSTNAME scheme: <thing>.<cluster>.<region>.<provider>.yucca.internal
# (the node hostname convention yucca-<provider>-<region>-<cluster>-… reversed into
# DNS hierarchy).
#
# NB: yucca.internal is account-wide but lives here for now (only site using it).
# Move the zone to a shared/global netbird stack if a second site needs it.

# The account-wide "yucca" users group (operators). Looked up so operators resolve
# the zone. Site node groups get it via distribution too.
data "netbird_group" "yucca" {
  name = "yucca"
}

resource "netbird_dns_zone" "yucca_internal" {
  name                 = "yucca-internal"
  domain               = "yucca.internal"
  enabled              = true
  enable_search_domain = false
  distribution_groups = [
    data.netbird_group.yucca.id, # operators (bigmac, etc.)
    module.netbird.group_ids["talos"],
    module.netbird.group_ids["mgmt"],
    module.netbird.group_ids["ci"],
    module.netbird.group_ids["k8s_operator"],
  ]
}

locals {
  # father control-plane hosts. Node names (kaycee/bettie/ofelia) are deterministic
  # per cluster; kube-cp IPs are .11/.12/.13 (cp_ip_offset 11 in the talos stack).
  father_cps = {
    kaycee = cidrhost(module.addr_site.kube_cp_cidr, 11)
    bettie = cidrhost(module.addr_site.kube_cp_cidr, 12)
    ofelia = cidrhost(module.addr_site.kube_cp_cidr, 13)
  }
  father_kube_api_fqdn = "kube.father.${var.region_code}.${var.provider_code}.yucca.internal"
}

# Per-CP host records: <node>.k8s.father.<region>.<provider>.yucca.internal → kube-cp IP.
resource "netbird_dns_record" "father_cp" {
  for_each = local.father_cps
  zone_id  = netbird_dns_zone.yucca_internal.id
  name     = "${each.key}.k8s.father.${var.region_code}.${var.provider_code}.yucca.internal"
  type     = "A"
  content  = each.value
  ttl      = 300
}

# API endpoint — round-robin over the 3 CP IPs. NOT the LB: hcloud LBs refuse
# traffic from their own targets (the CPs), so the endpoint resolves straight to
# the CPs (reachable over the yucca-fsn-father-kube-cp route).
resource "netbird_dns_record" "father_kube_api" {
  for_each = local.father_cps
  zone_id  = netbird_dns_zone.yucca_internal.id
  name     = local.father_kube_api_fqdn
  type     = "A"
  content  = each.value
  ttl      = 300
}

output "kube_api_fqdn" {
  description = "father API endpoint FQDN — NetBird peers resolve it (round-robin) to the CPs."
  value       = local.father_kube_api_fqdn
}
