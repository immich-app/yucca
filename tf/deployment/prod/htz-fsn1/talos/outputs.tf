output "cluster_summary" {
  description = "Non-sensitive cluster facts. kube/talosconfig are in the sensitive outputs + 1Password."
  value = {
    cluster_name      = var.cluster.name
    api_endpoint      = local.cluster_endpoint
    api_dns_name      = local.api_dns_name
    operator_endpoint = local.operator_endpoint
    lb_public_ipv4    = hcloud_load_balancer.kube_api.ipv4 # point api_dns_name here
    lb_private_ip     = local.lb_private_ip
    cp_public_ips     = local.cp_public_ips
    cp_private_ips    = local.cp_private_ips
    worker_fabric_ips = [for w in var.cluster.workers : w.fabric_ip]
  }
}

# DNS hint: create an A record api_dns_name → lb_public_ipv4 (the kubeconfig +
# cert SANs already use api_dns_name).
output "api_dns_record" {
  description = "The A record to create: <api_dns_name> → <lb public IPv4>."
  value       = "${local.api_dns_name} A ${hcloud_load_balancer.kube_api.ipv4}"
}

# Image Factory outputs — `mise run hetzner:talos-image` reads the hcloud URL to
# build the snapshot; the metal URL feeds the worker rescue-install runbook.
output "talos_schematic_id" {
  description = "Image Factory schematic id (from schematic.yaml)."
  value       = local.talos_schematic_id
}

output "talos_hcloud_image_url" {
  description = "Factory hcloud-amd64 raw.xz URL — input to hcloud-upload-image (CP snapshot)."
  value       = local.talos_hcloud_image_url
}

output "talos_metal_image_url" {
  description = "Factory metal-amd64 raw.xz URL — workers dd this in rescue."
  value       = local.talos_metal_image_url
}

output "talosconfig" {
  description = "Talosconfig YAML — endpoints = CP public IPs. Mirrored to 1P (YUCCA_PROD_TALOSCONFIG)."
  value       = data.talos_client_configuration.this.talos_config
  sensitive   = true
}

output "kubeconfig" {
  description = "Kubeconfig YAML — server = the API LB. Mirrored to 1P (YUCCA_PROD_KUBECONFIG)."
  value       = talos_cluster_kubeconfig.this.kubeconfig_raw
  sensitive   = true
}
