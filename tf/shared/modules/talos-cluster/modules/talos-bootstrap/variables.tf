# Variables consumed from the parent talos-cluster module. Names match
# the parent's contract for easy passthrough.

variable "cluster_name" {
  type        = string
  description = "Short cluster identifier (e.g., sietch). Used in Talos cluster_name."
}

variable "cluster_endpoint" {
  type        = string
  description = "URL Talos + K8s clients use to reach kube-apiserver. Defaults to https://<cp_vip>:6443 in the parent."
}

variable "cp_vip" {
  type        = string
  description = "Control-plane Virtual IP on VLAN 50. Patched into each CP machine config via machine.network.interfaces[].vip.ip on the enp1s0 interface entry (the same NIC the kernel ip= cmdline configures)."
}

variable "talos_version" {
  type        = string
  description = "Talos Linux version (e.g. '1.13.3'). Drives talos_machine_secrets machine config version + image references."
}

variable "talos_schematic_id" {
  type        = string
  default     = null
  description = "Optional Talos Image Factory schematic ID for custom images (extensions: qemu-guest-agent, util-linux-tools). When set, install.image points at the matching factory installer so disk installs keep the extensions. null = stock metal-amd64."
}

variable "kubernetes_version" {
  type        = string
  default     = null
  description = "Optional Kubernetes version override. null = Talos's bundled default."
}

variable "install_disk" {
  type        = string
  description = "Talos install disk (e.g. /dev/vda for libvirt virtio)."
}

variable "config_patches" {
  type        = list(string)
  default     = []
  description = "Extra strategic-merge YAML patches applied cluster-wide (both CP and worker machine configs)."
}

variable "profile" {
  type        = string
  description = "Active profile selector: 'smoke' or 'full'. Filters var.nodes."
}

variable "vlans" {
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
  description = "VLAN config. The compute subnet derives the VLAN-50 gateway/mask for the static enp1s0 interface patches (all nodes); enp2s0 (VLAN 51, workers) stays DHCP."
}

variable "nodes" {
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
  description = "Talos VM nodes, filtered by profile. Each gets a per-role machine_configuration_apply; bootstrap fires once against cp1. Sizing fields are unused here (consumed by inventory-renderer)."
}
