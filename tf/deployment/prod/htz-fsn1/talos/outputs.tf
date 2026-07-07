output "cluster_summary" {
  description = "Non-sensitive cluster facts. kube/talosconfig live in 1Password (secrets.tf)."
  value = {
    cluster_name      = var.cluster.name
    api_endpoint      = local.cluster_endpoint
    api_dns_name      = local.api_dns_name
    operator_endpoint = local.operator_endpoint
    lb_private_ip     = local.lb_private_ip
    cp_public_ips     = local.cp_public_ips
    cp_private_ips    = local.cp_private_ips
    worker_fabric_ips = [for w in var.cluster.workers : w.fabric_ip]
  }
}

# DNS hint: api_dns_name resolves to the PRIVATE LB IP (lb_public = false — the
# API is reachable only over the NetBird mesh; the netbird stack's
# yucca.futo.network zone serves the record). No public A record exists.
output "api_dns_record" {
  description = "The internal record: <api_dns_name> → <lb private IP> (NetBird DNS)."
  value       = "${local.api_dns_name} A ${local.lb_private_ip}"
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

# NO kubeconfig/talosconfig outputs — deliberately. They're mirrored to 1P
# (secrets.tf; titles in discovery.tf locals) and operators `op read` them.
# Root outputs are copied wholesale into every terraform_remote_state consumer's
# state (the netbird stack reads this stack's state for discovery), so sensitive
# outputs here would duplicate cluster-admin creds into a second state object.
