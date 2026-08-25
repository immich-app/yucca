# RGW service users, managed over the live RGW admin API via the radosgw
# provider. Key VALUES keep living in 1P: TF pushes the same predetermined
# keys to RGW that the ansible create-if-missing steps used to, so every
# consumer keeps reading the same items. Mirrors the staging stack's rgw-users.tf.
#
# Per-cluster opt-in (manage_rgw_users in clusters.auto.tfvars) because the
# provider needs two things that exist only after a converge:
#   1. the svc-yucca-terraform admin user on the RGW (rgw.yml Step 14.7),
#      authenticated with the <CLUSTER>_CEPH_TF_ADMIN_* keys this stack mints;
#   2. network reach to the RFC1918 S3 endpoint — infra.yml joins NetBird for
#      the ceph stack; local plans need the operator's own overlay connection.
#
# Bootstrap sequence for a new cluster, flag OFF:
#   apply (mints the TF_ADMIN_* items) → ceph converge (rgw.yml Step 14.7
#   creates the admin user; the service users no longer come from ansible) →
#   flip manage_rgw_users → apply creates the service users. sietch and spice
#   predate this file: their ansible-created users were adopted out-of-band
#   with `terragrunt import` (2026-08), so their first flagged plan was a
#   no-op.
#
# Decommissioning a managed cluster: destroy (or state-rm) its rgw resources
# BEFORE dropping the entry from clusters -- the provider instance must outlive
# the resources it destroys (tofu warns about the shared for_each at plan).

locals {
  rgw_managed_clusters = { for k, c in var.clusters : k => c if c.manage_rgw_users }

  rgw_users = {
    restic = {
      user_id      = "svc-yucca-restic"
      display_name = "yucca/restic service account"
      max_buckets  = null
      access_role  = "s3_restic_access"
      secret_role  = "s3_restic_secret"
    }
    metrics_worker = {
      user_id      = "metrics-worker"
      display_name = "yucca/metrics-worker RGW admin (read-only)"
      max_buckets  = 0
      access_role  = "metrics_worker_access"
      secret_role  = "metrics_worker_secret"
    }
    db_backup = {
      user_id      = "svc-yucca-db-backup"
      display_name = "yucca/db-backup service account (CNPG barman)"
      max_buckets  = 1
      access_role  = "db_backup_access"
      secret_role  = "db_backup_secret"
    }
  }

  rgw_cluster_users = merge([
    for cname, c in local.rgw_managed_clusters : {
      for uname, u in local.rgw_users :
      "${cname}.${uname}" => merge(u, {
        cluster     = cname
        max_buckets = coalesce(u.max_buckets, c.rgw_restic_max_buckets)
      })
    }
  ]...)

  # Every key this file reads from 1P: the provider's own admin credential plus
  # each service user's key pair. Data lookups (not the onepassword_item
  # resources in secrets.tf) so out-of-band roles (s3_restic_*) and TF-managed
  # roles resolve uniformly.
  rgw_key_roles = concat(
    ["tf_admin_access", "tf_admin_secret"],
    flatten([for u in local.rgw_users : [u.access_role, u.secret_role]]),
  )
  rgw_key_lookups = merge([
    for cname, c in local.rgw_managed_clusters : {
      for role in local.rgw_key_roles :
      "${cname}.${role}" => {
        vault = coalesce(c.vault, "Yucca")
        title = module.cluster[cname].secrets[role]
      }
    }
  ]...)
}

data "onepassword_item" "rgw_key" {
  for_each = local.rgw_key_lookups

  vault = data.onepassword_vault.target[each.value.vault].uuid
  title = each.value.title
}

provider "radosgw" {
  alias    = "cluster"
  for_each = local.rgw_managed_clusters

  endpoint   = "https://s3.${each.value.domain}"
  access_key = data.onepassword_item.rgw_key["${each.key}.tf_admin_access"].password
  secret_key = data.onepassword_item.rgw_key["${each.key}.tf_admin_secret"].password
  # The RGW frontend serves the self-signed cert from rgw.yml Step 11.6; there
  # is no CA to pin (the dashboard's RGW client skips verification the same way).
  tls_insecure_skip_verify = true
}

resource "radosgw_iam_user" "svc" {
  for_each = local.rgw_cluster_users
  provider = radosgw.cluster[each.value.cluster]

  user_id      = each.value.user_id
  display_name = each.value.display_name
  max_buckets  = each.value.max_buckets
}

resource "radosgw_iam_access_key" "svc" {
  for_each = local.rgw_cluster_users
  provider = radosgw.cluster[each.value.cluster]

  user_id    = radosgw_iam_user.svc[each.key].user_id
  access_key = data.onepassword_item.rgw_key["${each.value.cluster}.${each.value.access_role}"].password
  secret_key = data.onepassword_item.rgw_key["${each.value.cluster}.${each.value.secret_role}"].password
}

# Read-only admin caps for the usage/bucket/user stats scrape.
resource "radosgw_iam_user_caps" "metrics_worker" {
  for_each = local.rgw_managed_clusters
  provider = radosgw.cluster[each.key]

  user_id = radosgw_iam_user.svc["${each.key}.metrics_worker"].user_id
  caps = [
    { type = "buckets", perm = "read" },
    { type = "metadata", perm = "read" },
    { type = "usage", perm = "read" },
    { type = "users", perm = "read" },
  ]
}
