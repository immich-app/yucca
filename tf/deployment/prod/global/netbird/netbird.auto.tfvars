# Global prod NetBird layer (objects auto-prefixed "yucca_prod_"). Reserved for
# ACCOUNT-WIDE / cross-site prod resources — groups or policies that span every
# prod site.
#
# Empty today: with per-env CI and site-scoped mgmt/talos/k8s_operator groups,
# all current prod objects live in the site layers (prod/<site>/netbird). This
# stack exists as the layer those site layers build on (a cross-site policy, or a
# shared group consumed via the site layer's `external_groups`, would land here).

# No cross-site groups today. The former shared "yucca_resource" tag was retired
# (#yucca_resource deprecation): each site layer now owns its OWN resource
# group(s) flagged `resource = true`, and the shared netbird-env module
# auto-generates that site's "<PREFIX>_YUCCA_TO_RESOURCES" policy from them — so
# yucca users reach every resource group we create without an account-wide tag or
# a hand-maintained destination list. An account-spanning group would still land
# here (created in this layer, consumed by sites via `external_groups`).
groups = {}

setup_keys = {}

policies = {}
