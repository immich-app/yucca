# htz-fsn1 site NetBird objects (auto-prefixed "yucca_prod_htz_fsn1_").
# Setup-key plaintext → the yucca_tf_prod vault. NetBird is default-deny: a peer
# gets only the access its groups' policies grant.

groups = {
  ci           = {} # ephemeral CI runners → yucca_prod_htz_fsn1_ci
  mgmt         = {} # management nodes (configured via ansible); also the route peers
  talos        = {} # Talos cluster nodes → yucca_prod_htz_fsn1_talos
  k8s_operator = {} # in-cluster kubernetes operator → yucca_prod_htz_fsn1_k8s_operator
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
}

# Site identifier (mirrors prod/htz-fsn1's site_id). Feeds the fabric-addressing
# plan in addressing.tf; the routed-network CIDRs derive from it.
#
# The "HTZ-FSN1" Network (built in netbird.tf) routes the site subnets — CIDRs
# propagated from the fabric-addressing plan — and tags every resource into the
# shared "yucca_resource" group, so access is governed by the account-wide
# yucca→yucca_resource policy (prod/global). Nothing to declare here per subnet.
site_id = 40
