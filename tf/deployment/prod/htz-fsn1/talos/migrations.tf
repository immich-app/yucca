# ── One-shot state migration: count → hostname-keyed workers ─────────────────
# Moves the existing worker apply instances to their stable hostname keys and
# forgets the retired node-names shuffle module WITHOUT destroying anything.
# The gate before merging: a local `mise tf:plan` must show exactly these three
# moves + one "removed from state" + the on_destroy in-place updates — zero
# destroys, zero replaces, zero diffs on the CP resources.
# DELETE this file once CI has applied it (the blocks are inert afterwards, but
# the `removed` block conflicts if module "names" is ever reintroduced).

moved {
  from = talos_machine_configuration_apply.worker[0]
  to   = talos_machine_configuration_apply.worker["yucca-htz-fsn-father-k8s-jeanne"]
}

moved {
  from = talos_machine_configuration_apply.worker[1]
  to   = talos_machine_configuration_apply.worker["yucca-htz-fsn-father-k8s-sheron"]
}

moved {
  from = talos_machine_configuration_apply.worker[2]
  to   = talos_machine_configuration_apply.worker["yucca-htz-fsn-father-k8s-dianna"]
}

# Forget (don't destroy) the retired names module — its only resource is a
# random_shuffle; destroying would be inert, but "forget" keeps the plan clean.
removed {
  from = module.names

  lifecycle {
    destroy = false
  }
}
