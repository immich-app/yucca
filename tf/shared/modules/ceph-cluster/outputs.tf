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

output "inventory_path" {
  value = local_file.inventory.filename
}

output "secrets_template_path" {
  value = local_file.secrets_template.filename
}
