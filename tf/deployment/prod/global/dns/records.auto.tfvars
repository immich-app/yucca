# futo.cloud zone (FUTO Account).
zone_id = "474fbfd96bf49879054a493f126c4071"

# Spice RGW S3 endpoint (prod). A single health-checked Ceph ingress VIP,
# 10.40.20.250 -- NOT round-robin over the node fabric IPs anymore. The VIP is
# owned by the ceph ingress service (haproxy + keepalived) on the spice cluster:
# keepalived floats the VIP across the ingress hosts and haproxy health-checks the
# RGW backends, so a dead node is drained by the load balancer instead of
# blackholing one entry of an N-way DNS rotation. The apex and the wildcard both
# resolve to this one address.
#
# SOURCE OF TRUTH for the VIP is the ansible ceph side: `ceph_rgw_ingress_vip`
# (spice group_vars) must equal the address set here. If that VIP changes, change
# it in both places (and re-run tf/scripts/check-s3-dns-roster.py, the CI gate
# s3-dns-roster-validate, which asserts these A-records equal the expected VIP).
#
# The VIP sits on the fabric public network (10.40.20.0/23, VLAN 120) where
# RGW/beast binds. RFC1918: the name resolves anywhere, but the address routes
# only from networks that reach the fabric. NetBird advertises cls1_public
# (10.40.20.0/23) to the overlay, so overlay clients (michael) resolve and reach
# it; proxied stays false (Cloudflare cannot proxy a private address). The
# wildcard serves S3 virtual-hosted buckets (<bucket>.s3.prod.fsn1.htz.futo.cloud);
# the cluster rgw_dns_name and the self-signed TLS cert SANs expect both names.
#
# APPLY ORDERING (operator-coordinated, not enforced in TF): do NOT apply this DNS
# cutover before the Ceph ingress service is live, or the endpoint goes dark.
# Sequence: deploy ingress via the ceph converge, verify the VIP answers on
# 10.40.20.250, THEN apply this DNS. (Rollback is the reverse: point DNS back at
# the node roster before tearing the ingress down.)
records = {
  "s3.prod.fsn1.htz.futo.cloud" = {
    type    = "A"
    values  = ["10.40.20.250"] # ceph_rgw_ingress_vip (spice group_vars)
    comment = "Spice RGW S3 endpoint -- ceph ingress VIP (tf/deployment/prod/global/dns)"
  }
  "*.s3.prod.fsn1.htz.futo.cloud" = {
    type    = "A"
    values  = ["10.40.20.250"] # ceph_rgw_ingress_vip (spice group_vars)
    comment = "Spice RGW S3 virtual-hosted buckets -- ceph ingress VIP (tf/deployment/prod/global/dns)"
  }
}
