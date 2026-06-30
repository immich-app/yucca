# htz-fsn1 site NetBird objects (rendered UPPER_SNAKE, auto-prefixed
# "YUCCA_PROD_HTZ_FSN1_"). Setup-key plaintext → the yucca_tf_prod vault. NetBird
# is default-deny: a peer gets only the access its groups' policies grant.

# Every group is a "yucca tag" (`resource = true`): the netbird-env module makes
# yucca users able to reach each one — its peers (SSH to the nodes) and any network
# resources tagged into it — via the auto-generated
# YUCCA_PROD_HTZ_FSN1_YUCCA_TO_RESOURCES policy. (`resource = true` means
# yucca-reachable here, not strictly a network-resource tag.) `resources` is the
# routed-subnet tag the site Network resources (netbird.tf) are tagged into;
# it replaced the retired shared "yucca_resource" tag.
groups = {
  ci           = { resource = true } # ephemeral CI runners → YUCCA_PROD_HTZ_FSN1_CI
  mgmt         = { resource = true } # management nodes (ansible); also the route peers
  talos        = { resource = true } # Talos cluster nodes → YUCCA_PROD_HTZ_FSN1_TALOS
  k8s_operator = { resource = true } # in-cluster kubernetes operator
  resources    = { resource = true } # routed-subnet tag → YUCCA_PROD_HTZ_FSN1_RESOURCES
}

setup_keys = {
  ci           = { type = "reusable", ephemeral = true, auto_groups = ["ci"] }
  mgmt         = { type = "reusable", auto_groups = ["mgmt"] }
  talos        = { type = "reusable", auto_groups = ["talos"] }
  k8s_operator = { type = "reusable", auto_groups = ["k8s_operator"] }
}

policies = {
  # CI reaches everything at this site (deploy/manage access to every node group).
  ci-to-all = {
    description = "CI → all htz-fsn1 node groups."
    rules = [{
      name         = "ci-to-all"
      protocol     = "all"
      sources      = ["ci"]
      destinations = ["mgmt", "talos", "k8s_operator"]
    }]
  }

  # CI also reaches the routed site subnets (switch vme 10.40.5.0/24 + api +
  # cluster nets), so the fabric jobs can NETCONF the switches over the overlay
  # (the switches are routed resources behind the mgmt peers, not peers
  # themselves). `resources` is this site's resource group — every routed
  # resource is tagged into it (see the groups block + netbird.tf).
  ci-to-resources = {
    description = "CI → routed site subnets (resources)."
    rules = [{
      name          = "ci-to-resources"
      protocol      = "all"
      bidirectional = false
      sources       = ["ci"]
      destinations  = ["resources"]
    }]
  }
}

# Site identifier (mirrors prod/htz-fsn1's site_id). Feeds the fabric-addressing
# plan in addressing.tf; the routed-network CIDRs derive from it.
#
# The "HTZ-FSN1" Network (built in netbird.tf) routes the site subnets — CIDRs
# propagated from the fabric-addressing plan — and tags every resource into this
# site's "resources" group, so access is governed by the module-generated
# YUCCA_PROD_HTZ_FSN1_YUCCA_TO_RESOURCES policy. Nothing to declare here per subnet.
site_id = 40
