output "cluster_name" {
  value = var.cluster_name
}

output "domain" {
  value = var.domain
}

output "fqdn_cluster" {
  description = "Cluster-level FQDN segment derived from parts (e.g., sietch-ceph.dev.austin.int.futo.cloud)."
  value       = "${var.cluster_name}-${var.role_in_hostname}.${var.domain}"
}

output "hosts" {
  description = "Computed host list with hostname_short and fqdn."
  value       = local.hosts_computed
}

output "bootstrap_host" {
  description = "The host that runs cephadm bootstrap."
  value       = local.bootstrap_host
}

output "secrets" {
  description = "Map of secret logical name to 1P item title."
  value       = local.secrets
}

output "inventory_dirname" {
  description = "Inventory directory name (<cluster>-ceph.<partition>.<region>.<provider>). The render wrapper writes files under ansible/ceph/inventories/<this>/."
  value       = local.inventory_dirname
}

output "rendered_files" {
  description = "Map of filename => rendered content (inventory.ini, inventory-destroy.ini, secrets.yml.tpl, plus inventory-provision.ini when a provision_profile is set). Written locally by scripts/render-inventories.sh — intentionally NOT a local_file, so no filesystem path enters shared state."
  value       = local.rendered_files
}
