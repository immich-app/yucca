variable "ansible_project_root" {
  description = "Absolute path to yucca/ansible/talos/ where inventories/ live. Rendered inventories go under here."
  type        = string
}

variable "clusters" {
  description = "Map of Talos cluster spec keyed by short cluster name (sietch, ...). Mirrors ceph-cluster's shape with talos-specific additions (vlans, cp_vip, talos_version, profile)."
  type = map(object({
    # Identity / FQDN ingredients (parity with ceph-cluster).
    # environment/datacenter/provider_code feed only the inventory
    # directory name (<cluster>-talos.<env>.<dc>.<provider>).
    domain           = string
    environment      = string
    datacenter       = string
    provider_code    = string
    role_in_hostname = optional(string, "talos")
    ansible_ssh_user = string
    ansible_ssh_key  = string

    # Hypervisor hosts (rendered into Ansible inventory)
    hypervisors = list(object({
      name    = string
      bond_ip = string
    }))

    # Talos VM network plan
    cp_vip = string
    vlans = object({
      compute = object({
        id         = number
        bridge     = string
        subnet     = string
        dhcp_start = string
        dhcp_end   = string
      })
      services = object({
        id     = number
        bridge = string
        subnet = string
      })
    })

    # Talos version + schematic pinning (image/kernel/initramfs checksums
    # live in ansible group_vars — the single consumer of those values)
    talos_version      = string
    talos_schematic_id = optional(string)

    # Profile selector (full = 3 CP + 3 workers, 1 CP + 1 worker per host —
    #                   production; smoke = 1 CP + 1 worker on laurel,
    #                   single-host validation)
    profile = optional(string, "full")

    # talos-bootstrap iterates `nodes` to apply machine_configuration per
    # VM; the inventory-renderer reads name/role/hypervisor/ip/sizing only.
    nodes = optional(list(object({
      name       = string
      role       = string
      hypervisor = string
      static_ip  = optional(string)
      profiles   = optional(list(string), ["full", "smoke"])
      # VM sizing — optional; the inventory-renderer applies role defaults
      # (control-plane 4096/2/50, worker 8192/4/100) when unset.
      ram_mib  = optional(number)
      vcpus    = optional(number)
      disk_gib = optional(number)
    })), [])

    # Talos config knobs (optional overrides applied during bootstrap).
    install_disk       = optional(string, "/dev/vda")
    kubernetes_version = optional(string)
    cluster_endpoint   = optional(string)
    config_patches     = optional(list(string), [])

    # Secrets flag — flip true when real op:// refs exist in the
    # secrets template (forces scripts/ansible-play.sh through op inject).
    render_secrets_template = optional(bool, false)
  }))

  validation {
    condition = alltrue([
      for c in var.clusters :
      contains(["full", "smoke"], c.profile)
    ])
    error_message = "Each cluster.profile must be 'smoke' or 'full'."
  }
}
