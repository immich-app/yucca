locals {
  # Directory naming: <cluster>-ceph.<env>.<dc>.<provider>
  # Project-scoped ("ceph"), not hostname-role-scoped — mirrors the secret-prefix
  # convention (<CLUSTER>_CEPH_*) so all ceph-project artifacts are grep-able
  # under *-ceph.* regardless of whether hosts are named with ceph/osd/mon role.
  inventory_dirs = {
    for cname, c in var.clusters :
    cname => "${var.ansible_project_root}/inventories/${cname}-ceph.${c.environment}.${c.datacenter}.${c.provider_code}"
  }
}

module "cluster" {
  for_each = var.clusters
  source   = "../../../shared/modules/ceph-cluster"

  cluster_name     = each.key
  domain           = each.value.domain
  environment      = each.value.environment
  datacenter       = each.value.datacenter
  provider_code    = each.value.provider_code
  role_in_hostname = coalesce(each.value.role_in_hostname, "ceph")
  ansible_ssh_user = each.value.ansible_ssh_user
  ansible_ssh_key  = each.value.ansible_ssh_key
  vault            = coalesce(each.value.vault, "Yucca")
  hosts            = each.value.hosts

  ansible_inventory_path           = "${local.inventory_dirs[each.key]}/inventory.ini"
  ansible_destroy_inventory_path   = "${local.inventory_dirs[each.key]}/inventory-destroy.ini"
  ansible_provision_inventory_path = "${local.inventory_dirs[each.key]}/inventory-provision.ini"
  ansible_secrets_template_path    = "${local.inventory_dirs[each.key]}/secrets.yml.tpl"

  provision_profile = each.value.provision_profile

  # NOTE: onepassword_item provisioning is dormant per ADR-009. Re-enable
  # once a dedicated ceph-scoped 1P service account replaces the org-wide
  # superuser SA (current blocker). See secrets.tf.disabled for the dormant
  # resource declarations. Items referenced by secrets.yml.tpl already exist
  # in var.vault (yucca_tf_dev) — created via the superuser SA + op CLI.
}

output "cluster_summaries" {
  value = {
    for k, m in module.cluster : k => {
      fqdn           = m.fqdn_cluster
      bootstrap_host = m.bootstrap_host.hostname_short
      host_count     = length(m.hosts)
      inventory      = m.inventory_path
      secrets_tpl    = m.secrets_template_path
      secrets        = m.secrets
    }
  }
}
