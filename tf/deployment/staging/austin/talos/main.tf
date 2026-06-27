module "cluster" {
  for_each = var.clusters
  source   = "../../../../shared/modules/talos-baremetal"

  cluster_name       = each.key
  talos_version      = each.value.talos_version
  kubernetes_version = each.value.kubernetes_version
  talos_schematic_id = each.value.talos_schematic_id
  install_disk       = each.value.install_disk

  cluster_vip      = each.value.cluster_vip
  cluster_endpoint = each.value.cluster_endpoint

  gateway     = each.value.gateway
  subnet_cidr = each.value.subnet_cidr
  nameservers = each.value.nameservers

  allow_scheduling_on_control_planes = each.value.allow_scheduling_on_control_planes

  cni                          = each.value.cni
  disable_kube_proxy           = each.value.disable_kube_proxy
  enable_hubble_firewall_ports = each.value.hubble

  # When the CNI is installed after bootstrap (cilium/none), don't require
  # node-Ready in the bootstrap health gate — it'd deadlock with no CNI yet.
  # The post-CNI health check below enforces full readiness once Cilium is in.
  health_skip_kubernetes_checks = each.value.cni != "flannel"

  enable_ingress_firewall = each.value.enable_ingress_firewall
  trusted_cidrs           = each.value.trusted_cidrs
  trust_tailscale         = each.value.trust_tailscale
  pod_cidr                = each.value.pod_cidr

  bond           = each.value.bond
  nodes          = each.value.nodes
  config_patches = each.value.config_patches

  # Node-level NetBird overlay: append the ExtensionServiceConfig for the
  # siderolabs/netbird extension (no-op when the key is empty).
  netbird_setup_key = var.netbird_talos_setup_key
}

output "cluster_summaries" {
  description = "Per-cluster non-sensitive summary. kube/talosconfig are in the dedicated sensitive outputs below."
  value = {
    for k, m in module.cluster : k => {
      cluster_endpoint = m.cluster_endpoint
      cluster_vip      = m.cluster_vip
      cp_node_ips      = m.cp_node_ips
      all_node_ips     = m.all_node_ips
      bootstrap_cp_ip  = m.bootstrap_cp_ip
    }
  }
}

output "talosconfigs" {
  description = "Per-cluster talosconfig YAML. Persist to ~/.talos/<cluster>.config. Endpoints = direct CP IPs."
  value       = { for k, m in module.cluster : k => m.talosconfig }
  sensitive   = true
}

output "kubeconfigs" {
  description = "Per-cluster kubeconfig YAML. Persist to ~/.kube/<cluster>.config. Server = VIP URL."
  value       = { for k, m in module.cluster : k => m.kubeconfig }
  sensitive   = true
}
