include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# clusters.auto.tfvars is automatically loaded by OpenTofu in this directory.
# No explicit inputs {} block needed for cluster declarations.
inputs = {
  # ansible_project_root is relative to the repo root; terragrunt resolves
  # it via get_repo_root() so it works no matter where apply is run from.
  ansible_project_root = "${get_repo_root()}/ansible/ceph"
}
