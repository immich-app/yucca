# ── Discovery contract ──────────────────────────────────────────────────────
# Single non-sensitive envelope consumed by yuctl. kube/talosconfig are op://
# references to the 1P records written by secrets.tf (YUCCA_STAGING_KUBECONFIG /
# YUCCA_STAGING_TALOSCONFIG) — never inlined. See tf/README.md.

locals {
  _kubeconfig_title  = upper("YUCCA_${coalesce(var.partition, "STAGING")}_KUBECONFIG")
  _talosconfig_title = upper("YUCCA_${coalesce(var.partition, "STAGING")}_TALOSCONFIG")
  _disc_vault        = "yucca_tf_${coalesce(var.partition, "staging")}"
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
      cluster_name      = local.only_cluster_key
      api_endpoint      = local.k8s.cluster_endpoint
      operator_endpoint = local.k8s.operator_endpoint
      cp_node_ips       = local.k8s.cp_node_ips
      kubeconfig_ref    = "op://${local._disc_vault}/${local._kubeconfig_title}/password"
      talosconfig_ref   = "op://${local._disc_vault}/${local._talosconfig_title}/password"
    }
  }
}
