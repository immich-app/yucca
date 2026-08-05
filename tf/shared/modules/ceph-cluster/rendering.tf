# Rendered Ansible artifacts, exposed as OUTPUTS and written by
# ansible/ceph/scripts/render-inventories.sh — NOT local_file: local_file stores
# the checkout-specific path in shared state, so applies from another worktree
# force-replaced every file. Outputs keep paths out of state.

locals {
  # Matches the committed layout ansible/ceph/inventories/<partition>-<region>/<cluster>/.
  inventory_dirname = "${var.partition}-${var.region}/${var.cluster_name}"

  _inventory_template_vars = {
    cluster_name     = var.cluster_name
    domain           = var.domain
    hosts            = local.hosts_computed
    bootstrap_host   = local.bootstrap_host
    join_hosts       = local.join_hosts
    ansible_ssh_user = var.ansible_ssh_user
    ansible_ssh_key  = var.ansible_ssh_key
  }

  # Encoded here: yamlencode inside a heredoc breaks `tofu fmt` brace counting.
  _ceph_config_yaml = yamlencode({
    ceph_config_cluster = var.ceph_config
    ceph_config_host    = local.ceph_config_host
  })

  # inventory-provision.ini only when provision_profile is set (installimage
  # clusters are null). ceph-config.generated.yml sits beside the committed
  # vars.yml (generated/human split, as elsewhere).
  rendered_files = merge(
    {
      "inventory.ini"         = templatefile("${path.module}/templates/inventory.ini.tftpl", local._inventory_template_vars)
      "inventory-destroy.ini" = templatefile("${path.module}/templates/inventory-destroy.ini.tftpl", local._inventory_template_vars)
      "group_vars/all/ceph-config.generated.yml" = templatefile("${path.module}/templates/ceph-config.generated.yml.tftpl", {
        partition    = var.partition
        region       = var.region
        cluster_name = var.cluster_name
        config_yaml  = local._ceph_config_yaml
      })
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
