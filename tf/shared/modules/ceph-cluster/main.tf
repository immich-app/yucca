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
    # onepassword provider returns once a ceph-scoped 1P SA replaces the
    # superuser SA; dormant resources in secrets.tf.disabled.
  }
}

module "names" {
  source       = "../node-names"
  cluster_name = var.cluster_name
  name_seed    = var.name_seed
  names        = [for h in var.hosts : h.name]
}

# Preserves shuffle state — names must not re-randomize.
moved {
  from = random_shuffle.names
  to   = module.names.random_shuffle.names
}

locals {
  hosts_computed = [
    for i, h in var.hosts : {
      name           = module.names.resolved[i]
      bond_ip        = h.bond_ip
      bootstrap      = coalesce(h.bootstrap, false)
      roles          = h.roles
      hostname_short = "${var.cluster_name}-${var.role_in_hostname}-${module.names.resolved[i]}"
      fqdn           = "${var.cluster_name}-${var.role_in_hostname}-${module.names.resolved[i]}.${var.domain}"
      ceph_config    = h.ceph_config
    }
  ]

  # Per-host config -> `<section>/host:<hostname>` (the `ceph config set` mask
  # form); tfvars entries name the host only.
  ceph_config_host = merge([
    for h in local.hosts_computed : {
      for section, options in h.ceph_config :
      "${section}/host:${h.hostname_short}" => options
    }
  ]...)

  bootstrap_host = (
    length([for h in local.hosts_computed : h if h.bootstrap]) > 0
    ? [for h in local.hosts_computed : h if h.bootstrap][0]
    : local.hosts_computed[0]
  )

  join_hosts = [for h in local.hosts_computed : h if h.hostname_short != local.bootstrap_host.hostname_short]

  # UPPER_SNAKE 1P prefix <CLUSTER>_CEPH_*; "CEPH" hardcoded (hostname role
  # varies: 'ceph'/'osd'/'mon') so items grep-match *_CEPH_*.
  secret_prefix = "${upper(var.cluster_name)}_CEPH"

  secrets = merge({
    ops              = "${local.secret_prefix}_OPS_PASSWORD"
    dashboard        = "${local.secret_prefix}_DASHBOARD_PASSWORD"
    grafana          = "${local.secret_prefix}_GRAFANA_PASSWORD"
    s3_restic_access = "${local.secret_prefix}_S3_SVC_YUCCA_RESTIC_ACCESS_KEY"
    s3_restic_secret = "${local.secret_prefix}_S3_SVC_YUCCA_RESTIC_SECRET_KEY"
    # <CLUSTER>_METRICS_WORKER_* (no _CEPH infix) — matches the metrics-worker
    # consumer's 1P contract, named by cluster.
    metrics_worker_access = "${upper(var.cluster_name)}_METRICS_WORKER_ACCESS_KEY"
    metrics_worker_secret = "${upper(var.cluster_name)}_METRICS_WORKER_SECRET_KEY"
    },
    # Alertmanager receiver URL: opt-in, provisioned OUT OF BAND (external
    # webhook, not a generated password) — in ceph_unmanaged_secret_roles;
    # TF only references it.
    var.alertmanager_webhook ? {
      alertmanager_webhook = "${local.secret_prefix}_ALERTMANAGER_WEBHOOK_URL"
    } : {}
  )
}
