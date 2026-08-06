include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Inventories are emitted via the `render` output and written locally by
# ansible/ceph/scripts/render-inventories.sh (local_file coupled shared state
# to the applying worktree).
