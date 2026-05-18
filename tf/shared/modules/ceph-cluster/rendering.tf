# Rendered artifacts consumed by Ansible.
#
# These files are TF-generated — they must be in .gitignore on the Ansible side.
# Re-run `terragrunt apply` (or `tofu apply`) after changing cluster spec.

resource "local_file" "inventory" {
  filename        = var.ansible_inventory_path
  file_permission = "0644"
  content = templatefile("${path.module}/templates/inventory.ini.tftpl", {
    cluster_name     = var.cluster_name
    domain           = var.domain
    hosts            = local.hosts_computed
    bootstrap_host   = local.bootstrap_host
    join_hosts       = local.join_hosts
    ansible_ssh_user = var.ansible_ssh_user
    ansible_ssh_key  = var.ansible_ssh_key
  })
}

resource "local_file" "destroy_inventory" {
  filename        = var.ansible_destroy_inventory_path
  file_permission = "0644"
  content = templatefile("${path.module}/templates/inventory-destroy.ini.tftpl", {
    cluster_name     = var.cluster_name
    domain           = var.domain
    hosts            = local.hosts_computed
    bootstrap_host   = local.bootstrap_host
    join_hosts       = local.join_hosts
    ansible_ssh_user = var.ansible_ssh_user
    ansible_ssh_key  = var.ansible_ssh_key
  })
}

resource "local_file" "provision_inventory" {
  count           = var.provision_profile == null ? 0 : 1
  filename        = var.ansible_provision_inventory_path
  file_permission = "0644"
  content = templatefile("${path.module}/templates/inventory-provision-${var.provision_profile}.ini.tftpl", {
    cluster_name = var.cluster_name
    domain       = var.domain
    hosts        = local.hosts_computed
  })
}

resource "local_file" "secrets_template" {
  filename        = var.ansible_secrets_template_path
  file_permission = "0644"
  content = templatefile("${path.module}/templates/secrets.yml.tpl.tftpl", {
    cluster_name  = var.cluster_name
    vault         = var.vault
    secret_prefix = local.secret_prefix
    secrets       = local.secrets
  })
}
