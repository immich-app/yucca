locals {
  # Directory naming: <cluster>-talos.<env>.<dc>.<provider>
  # Project-scoped to "talos" — parallels ceph-cluster's
  # <cluster>-ceph.<env>.<dc>.<provider> convention.
  inventory_dirs = {
    for cname, c in var.clusters :
    cname => "${var.ansible_project_root}/inventories/${cname}-talos.${c.environment}.${c.datacenter}.${c.provider_code}"
  }
}

module "cluster" {
  for_each = var.clusters
  source   = "../../../shared/modules/talos-cluster"

  cluster_name     = each.key
  domain           = each.value.domain
  role_in_hostname = coalesce(each.value.role_in_hostname, "talos")
  ansible_ssh_user = each.value.ansible_ssh_user
  ansible_ssh_key  = each.value.ansible_ssh_key
  hypervisors      = each.value.hypervisors

  cp_vip             = each.value.cp_vip
  vlans              = each.value.vlans
  talos_version      = each.value.talos_version
  talos_schematic_id = each.value.talos_schematic_id
  profile            = coalesce(each.value.profile, "full")

  # talos-bootstrap inputs (passed through to the cluster module)
  nodes              = each.value.nodes
  install_disk       = coalesce(each.value.install_disk, "/dev/vda")
  kubernetes_version = each.value.kubernetes_version
  cluster_endpoint   = each.value.cluster_endpoint
  config_patches     = each.value.config_patches

  ansible_inventory_path        = "${local.inventory_dirs[each.key]}/inventory.ini"
  ansible_secrets_template_path = "${local.inventory_dirs[each.key]}/secrets.yml.tpl"
  render_secrets_template       = each.value.render_secrets_template
}

output "cluster_summaries" {
  description = "Per-cluster summary of identity, endpoints, and rendered artifact paths. Non-sensitive — kubeconfig/talosconfig live in the dedicated sensitive outputs below."
  value = {
    for k, m in module.cluster : k => {
      fqdn             = m.fqdn_cluster
      cp_vip           = m.cp_vip
      cluster_endpoint = m.cluster_endpoint
      hypervisors      = m.hypervisors
      cp_node_ips      = m.cp_node_ips
      all_node_ips     = m.all_node_ips
      bootstrap_cp_ip  = m.bootstrap_cp_ip
      inventory        = m.inventory_path
      secrets_tpl      = m.secrets_template_path
    }
  }
}

output "talosconfigs" {
  description = "Per-cluster talosconfig YAML. Persist to ~/.talos/<cluster>.config or 1P. Endpoints = direct CP IPs."
  value       = { for k, m in module.cluster : k => m.talosconfig }
  sensitive   = true
}

output "kubeconfigs" {
  description = "Per-cluster kubeconfig YAML. Persist to ~/.kube/<cluster>.config. Server = VIP URL."
  value       = { for k, m in module.cluster : k => m.kubeconfig }
  sensitive   = true
}
