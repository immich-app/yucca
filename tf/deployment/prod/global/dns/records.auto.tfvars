# futo.cloud zone (FUTO Account).
zone_id = "474fbfd96bf49879054a493f126c4071"

# Spice RGW S3 endpoint (prod). Round-robin A across all 47 spice ceph nodes'
# FABRIC public IPs (10.40.20.<host_index>, VLAN 120) -- RGW/beast binds only the
# fabric (ceph_bind_networks), so that is where it listens. RFC1918: the name
# resolves anywhere, but the addresses route only from networks that reach the
# fabric. NetBird advertises cls1_public (10.40.20.0/23) to the overlay, so overlay
# clients (michael) resolve and reach these; proxied stays false (Cloudflare cannot
# proxy private addresses). The wildcard serves S3 virtual-hosted buckets
# (<bucket>.s3.prod.fsn1.htz.futo.cloud); the cluster rgw_dns_name and the
# self-signed TLS cert SANs expect both names. noreen (host_index 40) is excluded
# (held in triage). Values generated from
# tf/deployment/prod/htz-fsn1/ceph/spice-hosts.yaml; regenerate if the roster
# changes.
records = {
  "s3.prod.fsn1.htz.futo.cloud" = {
    type = "A"
    values = [
      "10.40.20.4", "10.40.20.5", "10.40.20.6", "10.40.20.7", "10.40.20.8",
      "10.40.20.9", "10.40.20.10", "10.40.20.11", "10.40.20.12",
      "10.40.20.13", "10.40.20.14", "10.40.20.15", "10.40.20.16",
      "10.40.20.17", "10.40.20.18", "10.40.20.19", "10.40.20.20",
      "10.40.20.21", "10.40.20.22", "10.40.20.23", "10.40.20.24",
      "10.40.20.25", "10.40.20.26", "10.40.20.27", "10.40.20.28",
      "10.40.20.29", "10.40.20.30", "10.40.20.31", "10.40.20.32",
      "10.40.20.33", "10.40.20.34", "10.40.20.35", "10.40.20.36",
      "10.40.20.37", "10.40.20.38", "10.40.20.39", "10.40.20.41",
      "10.40.20.42", "10.40.20.43", "10.40.20.44", "10.40.20.45",
      "10.40.20.46", "10.40.20.47", "10.40.20.48", "10.40.20.49",
      "10.40.20.50", "10.40.20.51",
    ]
    comment = "Spice RGW S3 endpoint (tf/deployment/prod/global/dns)"
  }
  "*.s3.prod.fsn1.htz.futo.cloud" = {
    type = "A"
    values = [
      "10.40.20.4", "10.40.20.5", "10.40.20.6", "10.40.20.7", "10.40.20.8",
      "10.40.20.9", "10.40.20.10", "10.40.20.11", "10.40.20.12",
      "10.40.20.13", "10.40.20.14", "10.40.20.15", "10.40.20.16",
      "10.40.20.17", "10.40.20.18", "10.40.20.19", "10.40.20.20",
      "10.40.20.21", "10.40.20.22", "10.40.20.23", "10.40.20.24",
      "10.40.20.25", "10.40.20.26", "10.40.20.27", "10.40.20.28",
      "10.40.20.29", "10.40.20.30", "10.40.20.31", "10.40.20.32",
      "10.40.20.33", "10.40.20.34", "10.40.20.35", "10.40.20.36",
      "10.40.20.37", "10.40.20.38", "10.40.20.39", "10.40.20.41",
      "10.40.20.42", "10.40.20.43", "10.40.20.44", "10.40.20.45",
      "10.40.20.46", "10.40.20.47", "10.40.20.48", "10.40.20.49",
      "10.40.20.50", "10.40.20.51",
    ]
    comment = "Spice RGW S3 virtual-hosted buckets (tf/deployment/prod/global/dns)"
  }
}
