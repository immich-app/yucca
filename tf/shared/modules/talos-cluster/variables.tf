variable "cluster_name" {
  description = "Short cluster identifier (e.g., sietch). Drives hostname prefix and 1P item prefix."
  type        = string
}

variable "domain" {
  description = "Fully-qualified domain suffix (e.g., dev.austin.int.futo.cloud)."
  type        = string
}

variable "role_in_hostname" {
  description = "Role segment used in hostname generation. Defaults to 'talos' so hosts/VMs become <cluster>-talos-<name>.<domain>."
  type        = string
  default     = "talos"
}

variable "ansible_ssh_user" {
  description = "SSH user ansible connects to hypervisors as."
  type        = string
}

variable "ansible_ssh_key" {
  description = "Path to the SSH private key for ansible connections (tilde-expanded by ansible)."
  type        = string
}

variable "hypervisors" {
  description = "Ordered list of hypervisor hosts that will host Talos VMs. Each has a stable `name` (used in FQDN: <cluster>-ceph-<name>.<domain>) and `bond_ip` (ansible_host on the Ceph storage VLAN)."
  type = list(object({
    name    = string
    bond_ip = string
  }))

  validation {
    condition     = length(var.hypervisors) > 0
    error_message = "At least one hypervisor is required."
  }
}

variable "cp_vip" {
  description = "Control-plane Virtual IP on VLAN 50. Reserved OUTSIDE the DHCP range so leases can't collide."
  type        = string
}

variable "vlans" {
  description = "VLAN config for the Talos cluster — compute (VM primary NIC) and services (worker secondary NIC + LB/ingress)."
  type = object({
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
}

variable "talos_version" {
  description = "Talos Linux version to deploy (e.g., '1.13.3'). Pinned for reproducible rebuilds."
  type        = string
}

variable "profile" {
  description = "Active profile selector: full (3 CP + 3 workers, 1 CP + 1 worker per hypervisor — production) or smoke (1 CP + 1 worker on laurel — single-host validation)."
  type        = string
  default     = "full"

  validation {
    condition     = contains(["full", "smoke"], var.profile)
    error_message = "profile must be 'smoke' or 'full'."
  }
}

# ─── Rendered artifact paths (resolved per-cluster by the caller) ────────
variable "ansible_inventory_path" {
  description = "Absolute path to write the rendered inventory.ini."
  type        = string
}

variable "ansible_secrets_template_path" {
  description = "Absolute path to write the rendered secrets.yml.tpl (consumed by op inject at playbook time). Only written when render_secrets_template = true (default false until real secrets exist)."
  type        = string
}

variable "render_secrets_template" {
  description = "Whether to render secrets.yml.tpl. Default false (zero secrets → zero 1P prompts). Flip true once real cluster secrets exist."
  type        = bool
  default     = false
}

# ─── talos-bootstrap inputs ─────────────────────────────────────────────
# Consumed by the talos-bootstrap sub-module; inventory-renderer ignores
# them entirely. Defaults chosen to be safe no-ops.

variable "nodes" {
  description = <<-EOT
    Talos VM nodes — the SINGLE source of truth for cluster topology.
    talos-bootstrap applies machine config per node; inventory-renderer
    fans this out to per-host Ansible host_vars (talos_vms).

    Fields: name, role (control-plane|worker), hypervisor (by
    hypervisors[].name), static_ip (VLAN 50), profiles (default both),
    and optional ram_mib/vcpus/disk_gib (role defaults applied if unset).
  EOT
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

  validation {
    condition     = alltrue([for n in var.nodes : contains(["control-plane", "worker"], n.role)])
    error_message = "Each node.role must be 'control-plane' or 'worker'."
  }
}

variable "install_disk" {
  description = "Talos install disk path (passed to machine.install.disk patch). /dev/vda for libvirt virtio overlays; /dev/nvme0n1 for bare-metal OVH boxes (o11y)."
  type        = string
  default     = "/dev/vda"
}

variable "kubernetes_version" {
  description = "Kubernetes version Talos provisions (optional override; default = Talos's bundled version for the chosen talos_version)."
  type        = string
  default     = null
}

variable "cluster_endpoint" {
  description = "Cluster endpoint URL baked into talosconfig + kubeconfig. Defaults to https://<cp_vip>:6443 if null."
  type        = string
  default     = null
}

variable "talos_schematic_id" {
  description = "Talos image factory schematic ID for customized images (e.g. adding qemu-guest-agent or other extensions). Null = stock metal-amd64."
  type        = string
  default     = null
}

variable "config_patches" {
  description = "Extra strategic-merge YAML patches applied to ALL machine configs (CP and worker). Use for cluster-wide extensions: network nameservers, cluster.proxy tuning, extraManifests, etc. Per-role patches live inside talos-bootstrap."
  type        = list(string)
  default     = []
}
