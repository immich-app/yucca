include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# clusters.auto.tfvars is loaded automatically by OpenTofu in this directory.
# State backend + partition/region/stack (prod/htz-fsn1/talos) are derived by the
# root config. Unlike the austin talos stack (which talks straight to bare-metal
# nodes already in maintenance mode), this stack is HYBRID: it provisions the 3
# Hetzner Cloud control-plane VMs (+ a small private subnet for etcd + the API
# load balancer) AND drives Talos on the 3 bare-metal workers. CP↔worker traffic
# rides the NetBird mesh; worker east-west rides the 50G fabric. See ./README.md.
#
# Secrets (HCLOUD_TOKEN, NetBird setup key, S3 state) are injected by
#   op run --env-file=tf/.env.prod
