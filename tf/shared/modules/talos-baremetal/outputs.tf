output "cluster_name" {
  value = var.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint URL (VIP-based). Goes in kubeconfig.server."
  value       = local.cluster_endpoint
}

output "cluster_vip" {
  value = var.cluster_vip
}

output "cp_node_ips" {
  description = "Direct control-plane IPs (talosconfig endpoints — used for recovery when the VIP is unreachable)."
  value       = local.cp_addresses
}

output "all_node_ips" {
  description = "All node IPs (CPs + workers)."
  value       = [for k, n in local.node_map : n.address]
}

output "bootstrap_cp_ip" {
  description = "IP of the CP that ran the one-shot bootstrap. Re-running TF will NOT re-bootstrap unless that resource is tainted (re-rolls cluster identity)."
  value       = local.bootstrap_cp.address
}

output "operator_endpoint" {
  description = "Direct apiserver URL (https://<bootstrap CP IP>:6443) for tools applying in the same run (helm/kubernetes providers) — always reachable, unlike the VIP which only comes up after election."
  value       = "https://${local.bootstrap_cp.address}:6443"
}

output "client_configuration" {
  description = "Talos machine_secrets client_configuration (CA + admin client cert/key). Used by downstream talos_cluster_health / talosctl in the same stack."
  value       = talos_machine_secrets.this.client_configuration
  sensitive   = true
}

output "talosconfig" {
  description = "Talosconfig YAML — endpoints = direct CP IPs. Write to ~/.talos/<cluster>.config or 1P."
  value       = data.talos_client_configuration.this.talos_config
  sensitive   = true
}

output "kubeconfig" {
  description = "Kubeconfig YAML — server = VIP URL. Write to ~/.kube/<cluster>.config."
  value       = talos_cluster_kubeconfig.this.kubeconfig_raw
  sensitive   = true
}

output "kubernetes_client_configuration" {
  description = "Structured K8s client config for downstream consumers (helm/flux modules)."
  value       = talos_cluster_kubeconfig.this.kubernetes_client_configuration
  sensitive   = true
}
