terraform {
  required_version = ">= 1.6"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # onepassword provider re-enabled once a dedicated ceph-scoped 1P service
    # account replaces the org-wide superuser SA. See secrets.tf.disabled for
    # the currently-dormant resource declarations.
  }
}

# Auto host names come from the shared node-names inventory (the wordlist used to
# live here; it now backs both talos + ceph). cluster_name seeds the shuffle so each
# cluster gets its own permutation; explicit host names are excluded from the pool.
module "names" {
  source       = "../node-names"
  cluster_name = var.cluster_name
  name_seed    = var.name_seed
  names        = [for h in var.hosts : h.name]
}

# The wordlist + shuffle moved into node-names — preserve the existing shuffle state
# so host names don't re-randomize on this refactor.
moved {
  from = random_shuffle.names
  to   = module.names.random_shuffle.names
}

locals {
  # Resolve each host's final name: explicit or auto-picked from shuffle.
  hosts_computed = [
    for i, h in var.hosts : {
      name           = module.names.resolved[i]
      bond_ip        = h.bond_ip
      bootstrap      = coalesce(h.bootstrap, false)
      roles          = h.roles
      hostname_short = "${var.cluster_name}-${var.role_in_hostname}-${module.names.resolved[i]}"
      fqdn           = "${var.cluster_name}-${var.role_in_hostname}-${module.names.resolved[i]}.${var.domain}"
    }
  ]

  bootstrap_host = (
    length([for h in local.hosts_computed : h if h.bootstrap]) > 0
    ? [for h in local.hosts_computed : h if h.bootstrap][0]
    : local.hosts_computed[0]
  )

  join_hosts = [for h in local.hosts_computed : h if h.hostname_short != local.bootstrap_host.hostname_short]

  # SHOUTY_SNAKE_CASE prefix for 1P item names: <CLUSTER>_CEPH_*.
  # Hardcoded "CEPH" because this module manages Ceph clusters regardless of
  # hostname role (which varies: small clusters use 'ceph', large use 'osd'/'mon').
  # Every Ceph-project item grep-matches *_CEPH_* across all clusters.
  secret_prefix = "${upper(var.cluster_name)}_CEPH"

  secrets = {
    ops              = "${local.secret_prefix}_OPS_PASSWORD"
    dashboard        = "${local.secret_prefix}_DASHBOARD_PASSWORD"
    grafana          = "${local.secret_prefix}_GRAFANA_PASSWORD"
    s3_restic_access = "${local.secret_prefix}_S3_SVC_YUCCA_RESTIC_ACCESS_KEY"
    s3_restic_secret = "${local.secret_prefix}_S3_SVC_YUCCA_RESTIC_SECRET_KEY"
    # RGW admin (read-only) keys for the metrics worker. Titled <CLUSTER>_
    # METRICS_WORKER_* (no _CEPH infix) to match the metrics-worker consumer's
    # 1P contract, which is named by cluster, not by the ceph subsystem.
    metrics_worker_access = "${upper(var.cluster_name)}_METRICS_WORKER_ACCESS_KEY"
    metrics_worker_secret = "${upper(var.cluster_name)}_METRICS_WORKER_SECRET_KEY"
  }
}
