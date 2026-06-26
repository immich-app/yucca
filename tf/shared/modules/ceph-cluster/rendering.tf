# Rendered Ansible artifacts (inventory files + secrets template).
#
# These are exposed as module OUTPUTS (`rendered_files` / `inventory_dirname`),
# NOT written by tofu via `local_file`. A local wrapper —
# ansible/ceph/scripts/render-inventories.sh — reads the output and writes the
# files into the operator's own checkout.
#
# WHY: `local_file` stores the destination filename in state. With a shared
# remote backend that path is machine/checkout-specific, so it coupled the
# state to whichever git worktree last ran apply (get_repo_root() resolves to
# the *worktree* root). Any apply from a different checkout then saw the
# filename change and force-replaced every file — destroying the previous
# worktree's rendered files and rebinding shared state to the new path.
# Keeping rendered content in outputs (and writing it locally) removes
# filesystem paths from shared state entirely.

locals {
  # Inventory directory name: <cluster>-ceph.<env>.<dc>.<provider>.
  # Project-scoped ("ceph"), not hostname-role-scoped — mirrors the secret
  # prefix (<CLUSTER>_CEPH_*) so all ceph-project artifacts are grep-able under
  # *-ceph.* regardless of whether hosts are named with a ceph/osd/mon role.
  inventory_dirname = "${var.cluster_name}-ceph.${var.environment}.${var.datacenter}.${var.provider_code}"

  _inventory_template_vars = {
    cluster_name     = var.cluster_name
    domain           = var.domain
    hosts            = local.hosts_computed
    bootstrap_host   = local.bootstrap_host
    join_hosts       = local.join_hosts
    ansible_ssh_user = var.ansible_ssh_user
    ansible_ssh_key  = var.ansible_ssh_key
  }

  # filename => rendered content. inventory-provision.ini is only produced when
  # a provision_profile is set (e.g., sietch's debian-live; installimage-provisioned clusters are null).
  rendered_files = merge(
    {
      "inventory.ini"         = templatefile("${path.module}/templates/inventory.ini.tftpl", local._inventory_template_vars)
      "inventory-destroy.ini" = templatefile("${path.module}/templates/inventory-destroy.ini.tftpl", local._inventory_template_vars)
      "secrets.yml.tpl" = templatefile("${path.module}/templates/secrets.yml.tpl.tftpl", {
        cluster_name  = var.cluster_name
        vault         = var.vault
        secret_prefix = local.secret_prefix
        secrets       = local.secrets
      })
    },
    var.provision_profile == null ? {} : {
      "inventory-provision.ini" = templatefile("${path.module}/templates/inventory-provision-${var.provision_profile}.ini.tftpl", {
        cluster_name = var.cluster_name
        domain       = var.domain
        hosts        = local.hosts_computed
      })
    }
  )
}
