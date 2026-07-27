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
    # Reference an out-of-band <CLUSTER>_CEPH_ALERTMANAGER_WEBHOOK_URL item so
    # the cluster's alertmanager gets a real receiver. See the ceph-cluster
    # module's alertmanager_webhook variable.
    alertmanager_webhook = optional(bool, false)
    hosts = list(object({
      name      = optional(string)
      bond_ip   = string
      bootstrap = optional(bool, false)
      roles     = optional(list(string), ["mon", "mgr", "osd", "rgw"])
    }))
  }))
}
