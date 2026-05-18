variable "ansible_project_root" {
  description = "Absolute path to yucca/ansible/ceph/ where inventories/ live. Rendered inventories go under here."
  type        = string
}

variable "clusters" {
  description = "Map of cluster spec keyed by short cluster name (sietch, painbox, ...)."
  type = map(object({
    domain            = string
    environment       = string
    datacenter        = string
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
