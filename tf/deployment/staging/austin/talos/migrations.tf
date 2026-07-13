# ── One-shot state migration: address-keyed → hostname-keyed CP applies ──────
# The talos-baremetal module keys its per-node apply resources by HOSTNAME
# since the #243 cluster-naming change, but this stack's state still holds the
# pre-#243 ADDRESS keys — a variables.tf type bug (nodes[].name was
# non-optional) blocked every plan since, so the re-key was never planned. Left
# alone, the first apply would DESTROY the three live CP applies (module
# on_destroy: reset=true → wipes luke's control planes) and recreate them.
# These moves turn that into pure renames. Name↔address mapping verified from
# the plan on 2026-07-07 (the node-names shuffle is deterministic per cluster).
# DELETE this file once CI has applied it.

moved {
  from = module.cluster["luke"].talos_machine_configuration_apply.controlplane["10.10.10.117"]
  to   = module.cluster["luke"].talos_machine_configuration_apply.controlplane["yucca-int-aus-luke-k8s-aletha"]
}

moved {
  from = module.cluster["luke"].talos_machine_configuration_apply.controlplane["10.10.10.47"]
  to   = module.cluster["luke"].talos_machine_configuration_apply.controlplane["yucca-int-aus-luke-k8s-hobart"]
}

moved {
  from = module.cluster["luke"].talos_machine_configuration_apply.controlplane["10.10.10.242"]
  to   = module.cluster["luke"].talos_machine_configuration_apply.controlplane["yucca-int-aus-luke-k8s-shelby"]
}
