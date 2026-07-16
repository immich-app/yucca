include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# clusters.auto.tfvars is loaded automatically by OpenTofu in this directory.
# State backend + partition/region/stack (prod/htz-fsn1/talos) are derived by the
# root config. Like the austin talos stack, this talks straight to bare-metal
# nodes already in Talos maintenance mode: 3 CPs on the kube-cp fabric VLAN
# (etcd + API VIP) + 3 workers on the kube VLAN, routed by the spine IRBs.
# See ./README.md.
#
# Secrets (NetBird setup keys, S3 state) are injected by
#   op run --env-file=tf/.env.prod
