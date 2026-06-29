# Reserved `global` pseudo-region — partition-wide stacks (DNS, account NetBird).
# Not a physical site, so role + FQDN parts are null.
locals {
  role          = null
  site_id       = null
  datacenter    = null
  provider_code = null
  domain        = null
}
