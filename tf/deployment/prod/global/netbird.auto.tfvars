# Global prod NetBird layer (objects auto-prefixed "yucca_prod_"). Reserved for
# ACCOUNT-WIDE / cross-site prod resources — groups or policies that span every
# prod site.
#
# Empty today: with per-env CI and site-scoped mgmt/talos/k8s_operator groups,
# all current prod objects live in the site layers (prod/<site>/netbird). This
# stack exists as the layer those site layers build on (a cross-site policy, or a
# shared group consumed via the site layer's `external_groups`, would land here).

groups     = {}
setup_keys = {}
policies   = {}
