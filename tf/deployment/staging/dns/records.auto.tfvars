# futo.cloud zone (FUTO Account).
zone_id = "474fbfd96bf49879054a493f126c4071"

# yucca-staging ingress. The envoy Gateway terminates TLS on the cluster with a
# Let's Encrypt cert (cert-manager DNS-01), so these stay DNS-only (proxied =
# false): Cloudflare must not proxy/re-terminate, and DNS-01 issuance needs the
# real apex/wildcard records. apex covers web; the wildcard covers api./gw.
# (and admin. once it's exposed). All point at the public NAT, which forwards
# to the internal ingress VIP (10.10.10.16).
records = {
  "staging.backups.futo.cloud" = {
    type    = "A"
    values  = ["97.77.242.205"]
    comment = "yucca-staging ingress: web (apex)"
  }
  "*.staging.backups.futo.cloud" = {
    type    = "A"
    values  = ["97.77.242.205"]
    comment = "yucca-staging ingress: api./gw. (envoy Gateway)"
  }

  # Sietch RGW S3 endpoint (staging): round-robin A across the 3 ceph nodes'
  # bond IPs. RFC1918 (10.10.10.0/24 mgmt VLAN) -- resolvable anywhere, routable
  # only from networks that reach the VLAN; proxied stays false (Cloudflare can't
  # proxy private addresses). The wildcard serves S3 virtual-hosted buckets
  # (<bucket>.s3.staging.austin.int.futo.cloud); the cluster's rgw_dns_name and
  # TLS SANs expect it. See ansible/ceph/docs/s3-integration.md.
  "s3.staging.austin.int.futo.cloud" = {
    type    = "A"
    values  = ["10.10.10.90", "10.10.10.91", "10.10.10.92"]
    comment = "Sietch RGW S3 endpoint (tf/deployment/staging/dns)"
  }
  "*.s3.staging.austin.int.futo.cloud" = {
    type    = "A"
    values  = ["10.10.10.90", "10.10.10.91", "10.10.10.92"]
    comment = "Sietch RGW S3 virtual-hosted buckets (tf/deployment/staging/dns)"
  }
}
