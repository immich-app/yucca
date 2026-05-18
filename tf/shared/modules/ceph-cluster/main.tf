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
    # account replaces the org-wide superuser SA (per ADR-009). See
    # secrets.tf.disabled for the currently-dormant resource declarations.
  }
}

locals {
  # Wordlist for auto-assigning host names. Names are unique within a cluster
  # (not globally) — sietch-ceph-laurel and a hypothetical future
  # painbox-ceph-laurel could coexist, disambiguated by FQDN.
  wordlist = compact(split("\n", file("${path.module}/wordlist.txt")))

  # Operator-declared names are reserved — strip them from the pool so
  # auto-picked names can't collide within this cluster.
  explicit_names  = [for h in var.hosts : h.name if h.name != null]
  available_words = tolist(setsubtract(toset(local.wordlist), toset(local.explicit_names)))
}

# Full shuffle of available words, seeded by cluster name. Position-indexed:
# host[i] with name == null uses result[i]. Adding hosts at the tail is safe;
# existing positions keep their names across applies. Bumping name_seed forces
# a re-roll of the whole cluster (not recommended once hosts exist).
resource "random_shuffle" "names" {
  input        = local.available_words
  result_count = length(local.available_words)
  keepers = {
    cluster_name = var.cluster_name
    name_seed    = var.name_seed
  }
}

locals {
  # Resolve each host's final name: explicit or auto-picked from shuffle.
  hosts_computed = [
    for i, h in var.hosts : {
      name           = h.name != null ? h.name : random_shuffle.names.result[i]
      bond_ip        = h.bond_ip
      bootstrap      = coalesce(h.bootstrap, false)
      roles          = h.roles
      hostname_short = "${var.cluster_name}-${var.role_in_hostname}-${h.name != null ? h.name : random_shuffle.names.result[i]}"
      fqdn           = "${var.cluster_name}-${var.role_in_hostname}-${h.name != null ? h.name : random_shuffle.names.result[i]}.${var.domain}"
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
  }
}
