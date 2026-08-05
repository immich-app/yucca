output "cluster_summary" {
  description = "Non-sensitive cluster facts. kube/talosconfig live in 1Password (secrets.tf)."
  value = {
    cluster_name      = var.cluster.name
    api_endpoint      = local.cluster_endpoint
    api_dns_name      = local.api_dns_name
    api_vip           = local.api_vip
    operator_endpoint = local.operator_endpoint
    cp_ips            = local.cp_ips
    worker_fabric_ips = [for w in var.cluster.workers : w.fabric_ip]
  }
}

# api_dns_name → the Talos-elected VIP, served by the netbird stack's
# yucca.futo.network zone; no public A record.
output "api_dns_record" {
  description = "The internal record: <api_dns_name> → <API VIP> (NetBird DNS)."
  value       = "${local.api_dns_name} A ${local.api_vip}"
}

# Image Factory outputs — the metal URL feeds the rescue-install runbook (README).
output "talos_schematic_id" {
  description = "Image Factory schematic id (from schematic.yaml)."
  value       = local.talos_schematic_id
}

output "talos_metal_image_url" {
  description = "Factory metal-amd64 raw.xz URL — nodes dd this in rescue."
  value       = local.talos_metal_image_url
}

# NO kubeconfig/talosconfig outputs, deliberately: root outputs are copied into
# every terraform_remote_state consumer's state (netbird stack), duplicating
# cluster-admin creds. Operators `op read` the 1P records (secrets.tf).
