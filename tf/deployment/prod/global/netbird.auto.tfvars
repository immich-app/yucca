# Global prod NetBird layer (objects auto-prefixed "yucca_prod_"). Reserved for
# ACCOUNT-WIDE / cross-site prod resources — groups or policies that span every
# prod site.
#
# Empty today: with per-env CI and site-scoped mgmt/talos/k8s_operator groups,
# all current prod objects live in the site layers (prod/<site>/netbird). This
# stack exists as the layer those site layers build on (a cross-site policy, or a
# shared group consumed via the site layer's `external_groups`, would land here).

# The shared resource tag. Site layers tag every routed network resource into
# this group (via a terragrunt dependency on this stack), so one account-wide
# policy governs access to all of them. Explicit name → not prefixed "yucca_prod_".
groups = {
  yucca_resource = { name = "yucca_resource" }
}

setup_keys = {}

policies = {
  # Account-wide: members of the existing "yucca" users group reach every NetBird
  # resource tagged into "yucca_resource". One global policy covers all such
  # resources across every env/site. `yucca` is an external group resolved by name
  # in netbird.tf; `yucca_resource` is the group created above.
  #
  # bidirectional = false → only yucca users INITIATE to resources. yucca_resource
  # is never a source, so the tagged resources can't reach each other (or back to
  # users) — just be reached.
  yucca-to-resources = {
    description = "yucca users → all yucca_resource-tagged resources (account-wide)."
    rules = [{
      name          = "yucca-to-resources"
      protocol      = "all"
      bidirectional = false
      sources       = ["yucca"]
      destinations  = ["yucca_resource"]
    }]
  }
}
