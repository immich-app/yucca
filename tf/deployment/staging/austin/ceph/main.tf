module "cluster" {
  for_each = var.clusters
  source   = "../../../../shared/modules/ceph-cluster"

  cluster_name     = each.key
  domain           = each.value.domain
  partition        = each.value.partition
  region           = each.value.region
  provider_code    = each.value.provider_code
  role_in_hostname = coalesce(each.value.role_in_hostname, "ceph")
  ansible_ssh_user = each.value.ansible_ssh_user
  ansible_ssh_key  = each.value.ansible_ssh_key
  vault            = coalesce(each.value.vault, "Yucca")
  hosts            = each.value.hosts

  provision_profile = each.value.provision_profile
  ceph_config       = each.value.ceph_config

  # Password items (<CLUSTER>_CEPH_*) live in secrets.tf, keyed off this
  # module's `secrets` output — the module stays free of the 1P provider.
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

# `server`-mapped group members' SSH keys land in the ops account
# (group_vars/all/operators.yml below).
module "identity" {
  source = "../../../../shared/modules/identity"
}

# Read by ansible/ceph/scripts/render-inventories.sh → writes under
# ansible/ceph/inventories/<dirname>/. Content is an OUTPUT, not local_file —
# keeps checkout paths out of shared state (see module rendering.tf).
output "render" {
  description = "Per-cluster { dirname, files } for the local render wrapper."
  value = {
    for k, m in module.cluster : k => {
      dirname = m.inventory_dirname
      files = merge(m.rendered_files, {
        # gitignored
        "group_vars/all/operators.yml" = yamlencode({
          ops_authorized_keys = module.identity.server_authorized_keys
        })
      })
    }
  }
}
