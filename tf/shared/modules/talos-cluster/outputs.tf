output "cluster_name" {
  value = var.cluster_name
}

output "domain" {
  value = var.domain
}

output "fqdn_cluster" {
  description = "Cluster-level FQDN segment (e.g., sietch-talos.dev.austin.int.futo.cloud)."
  value       = "${var.cluster_name}-${var.role_in_hostname}.${var.domain}"
}

output "cp_vip" {
  description = "Control-plane VIP (kubeconfig endpoint goes here)."
  value       = var.cp_vip
}

output "hypervisors" {
  description = "Hypervisor hosts with computed FQDNs (<cluster>-ceph-<name>.<domain> — note: hypervisors keep their ceph role-in-hostname, not talos)."
  value = [
    for h in var.hypervisors : {
      name           = h.name
      hostname_short = "${var.cluster_name}-ceph-${h.name}"
      fqdn           = "${var.cluster_name}-ceph-${h.name}.${var.domain}"
      bond_ip        = h.bond_ip
    }
  ]
}

output "inventory_path" {
  value = module.inventory_renderer.inventory_path
}

output "secrets_template_path" {
  value = module.inventory_renderer.secrets_template_path
}

# ─── Talos cluster outputs (from talos-bootstrap sub-module) ────────────

output "talosconfig" {
  description = "Talosconfig YAML — endpoints = direct CP IPs (NOT VIP) per Talos recovery hygiene. Write to disk via local-exec, persist in 1P, etc."
  value       = module.talos_bootstrap.talosconfig
  sensitive   = true
}

output "kubeconfig" {
  description = "Kubeconfig YAML — server endpoint = cluster_endpoint (VIP-based URL)."
  value       = module.talos_bootstrap.kubeconfig
  sensitive   = true
}

output "kubernetes_client_configuration" {
  description = "Structured K8s client config for downstream consumers (helm/flux modules)."
  value       = module.talos_bootstrap.kubernetes_client_configuration
  sensitive   = true
}

output "cluster_endpoint" {
  description = "VIP-based cluster endpoint URL (https://<cp_vip>:6443). Goes in kubeconfig.server."
  value       = module.talos_bootstrap.cluster_endpoint
}

output "cp_node_ips" {
  description = "Direct CP node IPs (talosconfig endpoints — used for cluster recovery when VIP is unreachable)."
  value       = module.talos_bootstrap.cp_node_ips
}

output "all_node_ips" {
  description = "All filtered-profile node IPs (CPs + workers)."
  value       = module.talos_bootstrap.all_node_ips
}

output "bootstrap_cp_ip" {
  description = "IP of the CP that ran the one-shot bootstrap. Re-running TF will NOT re-bootstrap unless that resource is tainted (re-rolls cluster identity)."
  value       = module.talos_bootstrap.bootstrap_cp_ip
}
