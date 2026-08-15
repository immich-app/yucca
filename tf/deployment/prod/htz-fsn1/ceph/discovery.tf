# ── Discovery contract ──────────────────────────────────────────────────────
# Single non-sensitive envelope consumed by yuctl (parses .outputs.discovery
# .value from S3 state). Credentials are op:// references only — never values.
# See tf/README.md "Discovery outputs".

locals {
  _ceph_vaults = { for k, c in var.clusters : k => coalesce(c.vault, "Yucca") }
}

output "discovery_schema_version" {
  description = "Schema version of the discovery output envelope."
  value       = 1
}

output "discovery" {
  description = "Topology + ceph payload for this stack (non-sensitive)."
  value = {
    schema_version = 1
    partition      = var.partition
    region         = var.region
    slug           = var.slug
    role           = var.role
    stack          = var.stack
    stack_type     = "ceph"
    region_meta = {
      site_id       = var.site_id
      datacenter    = var.datacenter
      provider_code = var.provider_code
      domain        = var.domain
    }
    ceph_clusters = {
      for k, m in module.cluster : k => {
        cluster_name    = m.cluster_name
        fqdn            = m.fqdn_cluster
        rgw_s3_endpoint = "https://s3.${m.domain}"
        health_cred_ref = "op://${local._ceph_vaults[k]}/${m.secrets.dashboard}/password"
        s3_admin_cred_refs = {
          access_key = "op://${local._ceph_vaults[k]}/${m.secrets.metrics_worker_access}/password"
          secret_key = "op://${local._ceph_vaults[k]}/${m.secrets.metrics_worker_secret}/password"
        }
        # Full users+buckets RGW admin, used by the yucca APIs to create one S3
        # user per repository and by `yuctl repos migrate-storage-credentials`.
        # The S3 user that owns every bucket created before per-repository
        # credentials existed; `yuctl repos migrate-storage-credentials` signs
        # the bucket-ownership call with it before handing the bucket over.
        s3_owner_cred_refs = {
          access_key = "op://${local._ceph_vaults[k]}/${m.secrets.s3_restic_access}/password"
          secret_key = "op://${local._ceph_vaults[k]}/${m.secrets.s3_restic_secret}/password"
        }
        # Bucket ops for `yuctl repos migrate-storage-credentials`; never mounted
        # into the cluster, unlike the provisioner.
        s3_migrator_cred_refs = {
          access_key = "op://${local._ceph_vaults[k]}/${m.secrets.migrator_access}/password"
          secret_key = "op://${local._ceph_vaults[k]}/${m.secrets.migrator_secret}/password"
        }
        s3_provisioner_cred_refs = {
          access_key = "op://${local._ceph_vaults[k]}/${m.secrets.provisioner_access}/password"
          secret_key = "op://${local._ceph_vaults[k]}/${m.secrets.provisioner_secret}/password"
        }
        secret_item_titles = m.secrets
        bootstrap_host     = m.bootstrap_host.hostname_short
      }
    }
  }
}
