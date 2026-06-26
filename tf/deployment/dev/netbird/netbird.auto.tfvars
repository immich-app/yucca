# NetBird Cloud objects for yucca-dev. Names are auto-prefixed "yucca_dev_"
# (all underscores); setup-key plaintext is written to the yucca_tf_dev vault.
#
# Groups start empty — a peer joins a group by registering with a setup key whose
# auto_groups include it. NetBird is default-deny: a peer gets only the access its
# groups' policies grant.

groups = {
  ci           = {} # ephemeral CI runners → yucca_dev_ci
  mgmt         = {} # management nodes (configured via ansible) → yucca_dev_mgmt
  talos        = {} # Talos cluster nodes → yucca_dev_talos
  k8s_operator = {} # in-cluster kubernetes operator → yucca_dev_k8s_operator
}

setup_keys = {
  ci           = { type = "reusable", ephemeral = true, auto_groups = ["ci"] }
  mgmt         = { type = "reusable", auto_groups = ["mgmt"] }
  talos        = { type = "reusable", auto_groups = ["talos"] }
  k8s_operator = { type = "reusable", auto_groups = ["k8s_operator"] }
}

policies = {
  # CI reaches everything in this env (deploy/manage access to every node group).
  ci-to-all = {
    description = "CI → all dev node groups."
    rules = [{
      name         = "ci-to-all"
      protocol     = "all"
      sources      = ["ci"]
      destinations = ["mgmt", "talos", "k8s_operator"]
    }]
  }
}
