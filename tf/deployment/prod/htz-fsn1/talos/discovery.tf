# ── Discovery contract ──────────────────────────────────────────────────────
# Non-sensitive envelope consumed by yuctl (parses .outputs.discovery.value from
# S3 state). kube/talosconfig are op:// refs to the 1P records (secrets.tf).
locals {
  # REGION-scoped titles (partition alone collides: the fleet model allows N
  # regions per partition, each with its own cluster — matching the netbird
  # stacks' NETBIRD_YUCCA_PROD_HTZ_FSN1_* convention). Consumed by secrets.tf
  # (writes the 1P items) and the discovery refs below — single source.
  _cluster_slug      = upper(replace("${coalesce(var.partition, "prod")}_${var.region}", "-", "_"))
  _kubeconfig_title  = "YUCCA_${local._cluster_slug}_KUBECONFIG"
  _talosconfig_title = "YUCCA_${local._cluster_slug}_TALOSCONFIG"
  _disc_vault        = "yucca_tf_${coalesce(var.partition, "prod")}"
}

output "discovery_schema_version" {
  description = "Schema version of the discovery output envelope."
  value       = 1
}

output "discovery" {
  description = "Topology + region-k8s payload for this stack (non-sensitive)."
  value = {
    schema_version = 1
    partition      = var.partition
    region         = var.region
    slug           = var.slug
    role           = var.role
    stack          = var.stack
    stack_type     = "region-k8s"
    region_meta = {
      site_id       = var.site_id
      datacenter    = var.datacenter
      provider_code = var.provider_code
      domain        = var.domain
    }
    kubernetes = {
      cluster_name      = var.cluster.name
      api_endpoint      = local.cluster_endpoint  # https://<api_dns_name>:6443 (VIP)
      api_vip           = local.api_vip           # Talos-elected VIP on kube-cp (the api_dns_name A record)
      operator_endpoint = local.operator_endpoint # direct bootstrap-CP apiserver
      cp_node_ips       = local.cp_ips            # kube-cp IPs; operators/yuctl reach via NetBird
      worker_node_ips   = [for w in var.cluster.workers : w.fabric_ip]
      # Node NAME → IP maps (short wordlist names). Consumed by the netbird stack
      # (yucca.futo.network records) instead of hardcoding names in two stacks.
      cp_nodes        = { for n in var.cluster.cps : n.name => n.cp_ip }
      worker_nodes    = { for w in var.cluster.workers : w.name => w.fabric_ip }
      kubeconfig_ref  = "op://${local._disc_vault}/${local._kubeconfig_title}/password"
      talosconfig_ref = "op://${local._disc_vault}/${local._talosconfig_title}/password"
    }
  }
}
