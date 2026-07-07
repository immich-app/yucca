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
    hosts = list(object({
      name      = optional(string)
      bond_ip   = string
      bootstrap = optional(bool, false)
      roles     = optional(list(string), ["mon", "mgr", "osd", "rgw"])
    }))
  }))
}
