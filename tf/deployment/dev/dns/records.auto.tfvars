# futo.cloud zone (FUTO Account).
zone_id = "474fbfd96bf49879054a493f126c4071"

# Sietch RGW S3 endpoint: round-robin A records across the 3 ceph nodes'
# bond IPs. The addresses are RFC1918 (10.10.10.0/24 management VLAN) —
# resolvable from anywhere, routable only from networks that reach the
# mgmt VLAN. proxied stays false everywhere here: Cloudflare cannot proxy
# private addresses, and these names are internal infrastructure.
#
# The wildcard serves S3 virtual-hosted bucket addressing
# (<bucket>.s3.dev.austin.int.futo.cloud); the cluster's rgw_dns_name and
# TLS SANs already expect it. See ansible/ceph/docs/s3-integration.md.
records = {
  "s3.dev.austin.int.futo.cloud" = {
    type    = "A"
    values  = ["10.10.10.90", "10.10.10.91", "10.10.10.92"]
    comment = "Sietch RGW S3 endpoint (tf/deployment/dev/dns)"
  }
  "*.s3.dev.austin.int.futo.cloud" = {
    type    = "A"
    values  = ["10.10.10.90", "10.10.10.91", "10.10.10.92"]
    comment = "Sietch RGW S3 virtual-hosted buckets (tf/deployment/dev/dns)"
  }
  # move me to somewhere sensible!
  "futo.cloud" = {
    type    = "A"
    values  = ["45.144.160.215"] # homelab
    proxied = true
    comment = "Website (just serving .well-known/yucca.json)"
  }
}
