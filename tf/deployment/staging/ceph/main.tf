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

  provision_profile = each.value.provision_profile

  # Password items (<CLUSTER>_CEPH_*) are created at the stack level in
  # secrets.tf (mirrors tf/deployment/staging/talos), using this module's
  # `secrets` output for the item titles. The module itself stays free of the
  # onepassword provider so dev (which doesn't manage secrets in TF) is
  # unaffected.
}

output "cluster_summaries" {
  value = {
    for k, m in module.cluster : k => {
      fqdn           = m.fqdn_cluster
      bootstrap_host = m.bootstrap_host.hostname_short
      host_count     = length(m.hosts)
      inventory_dir  = m.inventory_dirname
      secrets        = m.secrets
    }
  }
}

# Consumed by ansible/ceph/scripts/render-inventories.sh: it reads this output
# and writes each cluster's files under ansible/ceph/inventories/<dirname>/.
# Rendered content lives in a TF OUTPUT (not in local_file resources), so the
# shared remote state never records a checkout-specific filesystem path. See
# the module's rendering.tf for the full rationale.
output "render" {
  description = "Per-cluster { dirname, files } for the local render wrapper."
  value = {
    for k, m in module.cluster : k => {
      dirname = m.inventory_dirname
      files   = m.rendered_files
    }
  }
}
