output "talosconfig" {
  description = "Talosconfig YAML — endpoints point at direct CP IPs (not the VIP) per Talos recovery hygiene."
  value       = data.talos_client_configuration.this.talos_config
  sensitive   = true
}

output "kubeconfig" {
  description = "Kubeconfig YAML — server endpoint = cluster_endpoint (VIP). Persist via 1P or write to ~/.kube/<cluster>.config."
  value       = talos_cluster_kubeconfig.this.kubeconfig_raw
  sensitive   = true
}

output "kubernetes_client_configuration" {
  description = "Structured K8s client config (client_certificate/client_key/ca_certificate). Downstream Flux/Helm modules can consume directly without parsing kubeconfig YAML."
  value       = talos_cluster_kubeconfig.this.kubernetes_client_configuration
  sensitive   = true
}

output "cluster_endpoint" {
  description = "VIP-based cluster endpoint URL (https://<cp_vip>:6443). Goes in kubeconfig.server."
  value       = var.cluster_endpoint
}

output "cp_node_ips" {
  description = "Direct CP node IPs (talosconfig endpoints; talosctl --endpoints uses these for cluster recovery scenarios where the VIP is unreachable)."
  value       = [for k, n in local.cp_node_map : n.static_ip]
}

output "all_node_ips" {
  description = "All filtered-profile node IPs (CPs + workers). Useful for talosctl operations targeting the whole cluster."
  value       = [for k, n in local.node_map : n.static_ip]
}

output "bootstrap_cp_ip" {
  description = "IP of the CP that ran the one-shot bootstrap. Re-running TF will NOT re-bootstrap unless the resource is tainted (which would re-roll cluster identity)."
  value       = local.bootstrap_cp.static_ip
}
