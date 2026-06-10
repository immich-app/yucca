variable "cluster_name" {
  type = string
}

variable "domain" {
  type = string
}

variable "role_in_hostname" {
  type    = string
  default = "talos"
}

variable "ansible_ssh_user" {
  type = string
}

variable "ansible_ssh_key" {
  type = string
}

variable "hypervisors" {
  type = list(object({
    name    = string
    bond_ip = string
  }))
}

variable "nodes" {
  description = "Talos VM nodes — rendered into per-host Ansible host_vars (talos_vms), grouped by hypervisor. Single source of truth for topology."
  type = list(object({
    name       = string
    role       = string
    hypervisor = string
    static_ip  = optional(string)
    profiles   = optional(list(string), ["full", "smoke"])
    ram_mib    = optional(number)
    vcpus      = optional(number)
    disk_gib   = optional(number)
  }))
  default = []
}

variable "inventory_path" {
  type        = string
  description = "Absolute path to write the rendered inventory.ini."
}

variable "secrets_template_path" {
  type        = string
  description = "Absolute path to write the secrets.yml.tpl. Only written when render_secrets_template = true."
}

variable "render_secrets_template" {
  type        = bool
  default     = false
  description = "Whether to render secrets.yml.tpl. Default false — scripts/ansible-play.sh detects file ABSENCE to skip op inject, so always-rendering would trigger 1P unlock on every play despite zero op:// refs. Flip true once real cluster secrets exist."
}
