include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# clusters.auto.tfvars is automatically loaded by OpenTofu in this directory.
# No inputs are injected here: rendered inventories are no longer written by
# tofu (which previously needed get_repo_root() to locate ansible/ceph and so
# coupled shared state to the applying worktree). Content is emitted via the
# `render` output and written locally by ansible/ceph/scripts/render-inventories.sh.
