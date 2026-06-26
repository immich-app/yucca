# NetBird Cloud objects for yucca-staging. Names are auto-prefixed "yucca_staging_"
# (all underscores); setup-key plaintext is written to the yucca_tf_staging vault.
#
# Groups start empty — a peer joins a group by registering with a setup key whose
# auto_groups include it. NetBird is default-deny: a peer gets only the access its
# groups' policies grant.

groups = {
  ci           = {} # ephemeral CI runners → yucca_staging_ci
  mgmt         = {} # management nodes (configured via ansible) → yucca_staging_mgmt
  talos        = {} # Talos cluster nodes → yucca_staging_talos
  k8s_operator = {} # in-cluster kubernetes operator → yucca_staging_k8s_operator
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
    description = "CI → all staging node groups."
    rules = [{
      name         = "ci-to-all"
      protocol     = "all"
      sources      = ["ci"]
      destinations = ["mgmt", "talos", "k8s_operator"]
    }]
  }

  # CI reaches the existing Liberty Park infra groups where the staging nodes
  # live today (the targets CI talks to over the overlay). lp_* are external
  # groups resolved by name in main.tf.
  ci-to-liberty-park = {
    description = "Staging CI → Liberty Park infra groups."
    rules = [{
      name         = "ci-to-liberty-park"
      protocol     = "all"
      sources      = ["ci"]
      destinations = ["lp_compute", "lp_server_monitoring", "lp_servers", "lp_services"]
    }]
  }
}
