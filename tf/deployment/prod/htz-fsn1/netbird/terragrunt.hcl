include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Site NetBird layer for htz-fsn1 — its own state, decoupled from the htz-fsn1
# fabric stack (state key: ceph/prod/htz-fsn1/netbird/terraform.tfstate, via the
# root's full-sub-path stack derivation).
#
# Self-contained today (site-scoped ci/mgmt/talos/k8s_operator groups + the
# HTZ-FSN1 routed network). If a cross-site/global group is ever needed, add a
# `dependency "global" { config_path = "../../global" }` and pass its output into
# this stack's `external_groups` input.
#
# netbird.auto.tfvars is loaded automatically; `env` is injected by the root.
