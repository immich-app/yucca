# NetBird Cloud objects for yucca-staging. Names render UPPER_SNAKE, auto-prefixed
# "YUCCA_STAGING_"; setup-key plaintext is written to the yucca_tf_staging vault.
#
# Groups start empty — a peer joins a group by registering with a setup key whose
# auto_groups include it. NetBird is default-deny: a peer gets only the access its
# groups' policies grant.

# Every group is a "yucca tag" (`resource = true`): yucca users reach each one
# (its peers — SSH to the nodes — and any tagged resources) via the module's
# auto-generated YUCCA_STAGING_YUCCA_TO_RESOURCES policy.
groups = {
  ci    = { resource = true } # ephemeral CI runners → YUCCA_STAGING_CI
  mgmt  = { resource = true } # management nodes (ansible) → YUCCA_STAGING_MGMT
  talos = { resource = true } # Talos cluster nodes → YUCCA_STAGING_TALOS
  # DELETION IN FLIGHT (two-phase): NetBird refuses to delete a group while a
  # policy still links it, and tofu orders the group destroy before the policy
  # updates that drop the references — the retired k8s_operator group is kept
  # one apply longer (resource = false, so no policy links it) so those
  # updates land, then this entry goes.
  k8s_operator = { resource = false }
}

setup_keys = {
  ci    = { type = "reusable", ephemeral = true, auto_groups = ["ci"] }
  mgmt  = { type = "reusable", auto_groups = ["mgmt"] }
  talos = { type = "reusable", auto_groups = ["talos"] }
}

policies = {
  # CI reaches everything in this env (deploy/manage access to every node group).
  ci-to-all = {
    description = "CI → all staging node groups."
    rules = [{
      name         = "ci-to-all"
      protocol     = "all"
      sources      = ["ci"]
      destinations = ["mgmt", "talos"]
    }]
  }

  # Talos nodes → o11y's staging mesh gateway (external group, resolved in
  # main.tf): vmagent + victoria-logs-collector remote-write to the
  # UNAUTHENTICATED mesh vmauth (vmauth.staging.o11y.futo.network:443) — this
  # ACL is the only gate. Mirrors prod's talos-to-o11y-gateway.
  talos-to-o11y-gateway = {
    description = "Talos nodes → o11y staging mesh gateway (unauth vmauth remote-write)."
    rules = [{
      name          = "talos-to-o11y-gateway"
      protocol      = "tcp"
      bidirectional = false
      sources       = ["talos"]
      destinations  = ["o11y_k8s_gateway"]
      ports         = ["443"]
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
