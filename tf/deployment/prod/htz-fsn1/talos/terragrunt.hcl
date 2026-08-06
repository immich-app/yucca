include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Bare-metal Talos: 3 CPs on kube-cp + 3 workers on kube, routed by the spine
# IRBs. See ./README.md. Secrets injected by op run --env-file=tf/.env.prod.
