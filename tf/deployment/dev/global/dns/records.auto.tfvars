# futo.cloud zone (FUTO Account).
zone_id = "474fbfd96bf49879054a493f126c4071"

# The Sietch RGW S3 endpoint records (s3.dev + *.s3.dev) were removed when the
# Austin cluster was promoted dev -> staging; the live records now live in
# tf/deployment/staging/dns. Only the stray homelab record remains here.
records = {
  # move me to somewhere sensible!
  "futo.cloud" = {
    type    = "A"
    values  = ["45.144.160.215"] # homelab
    proxied = true
    comment = "Website (just serving .well-known/yucca.json)"
  }
}
