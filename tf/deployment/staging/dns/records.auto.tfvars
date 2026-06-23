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
}
