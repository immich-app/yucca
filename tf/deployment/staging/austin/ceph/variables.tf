variable "clusters" {
  description = "Map of cluster spec keyed by short cluster name (sietch, ...)."
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
    # -> group_vars/all/ceph-config.generated.yml (`ceph_config_cluster`).
    # Empty for sietch today; the schema mirrors prod/htz-fsn1.
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
