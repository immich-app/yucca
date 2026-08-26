variable "clusters" {
  description = "Map of cluster spec keyed by short cluster name (spice, ...)."
  type = map(object({
    domain            = string
    partition         = string
    region            = string
    provider_code     = string
    role_in_hostname  = optional(string, "ceph")
    ansible_ssh_user  = string
    ansible_ssh_key   = string
    vault             = optional(string, "Yucca")
    provision_profile = optional(string)
    # Opt-in: manage the RGW service users via the radosgw provider. Flip only
    # after the cluster is converged (svc-yucca-terraform must exist on the
    # RGW). See rgw-users.tf for the bootstrap sequence.
    manage_rgw_users = optional(bool, false)
    # svc-yucca-restic bucket cap (RGW semantics: 0 = no limit, negative
    # disables creation). michael creates one bucket per repository, so prod
    # runs unlimited; the 100 default matches the historical staging value.
    rgw_restic_max_buckets = optional(number, 100)
    # Reference an out-of-band <CLUSTER>_CEPH_ALERTMANAGER_WEBHOOK_URL item so
    # the cluster's alertmanager gets a real receiver. See the ceph-cluster
    # module's alertmanager_webhook variable.
    alertmanager_webhook = optional(bool, false)
    # -> group_vars/all/ceph-config.generated.yml (`ceph_config_cluster`).
    # See the ceph-cluster module's ceph_config variable.
    ceph_config = optional(map(map(string)), {})
    hosts = list(object({
      name      = optional(string)
      bond_ip   = string
      bootstrap = optional(bool, false)
      roles     = optional(list(string), ["mon", "mgr", "osd", "rgw"])
      # -> `<section>/host:<hostname>` in ceph_config_host.
      ceph_config = optional(map(map(string)), {})
    }))
  }))
}
