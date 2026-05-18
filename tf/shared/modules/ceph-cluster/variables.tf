variable "cluster_name" {
  description = "Short cluster identifier (e.g., sietch, painbox). Used as hostname prefix and 1P item prefix."
  type        = string
}

variable "domain" {
  description = "Fully-qualified domain suffix (e.g., dev.austin.int.futo.cloud)."
  type        = string
}

variable "environment" {
  description = "Environment segment of the FQDN (dev, lab, staging, prod)."
  type        = string
}

variable "datacenter" {
  description = "Datacenter segment of the FQDN (austin, hel, etc.)."
  type        = string
}

variable "provider_code" {
  description = "Provider segment of the FQDN (int for internal/Austin, htz for Hetzner)."
  type        = string
}

variable "role_in_hostname" {
  description = "Role segment used in hostname generation. 'ceph' for mixed-role small clusters, 'osd' for single-role OSD-only nodes, etc."
  type        = string
  default     = "ceph"
}

variable "ansible_ssh_user" {
  description = "SSH user ansible connects as (ansible-iac for bare-metal post-baseline, root for Hetzner installimage)."
  type        = string
}

variable "ansible_ssh_key" {
  description = "Path to the SSH private key for ansible connections (tilde-expanded by ansible)."
  type        = string
}

variable "vault" {
  description = "1Password vault holding this cluster's secrets. 'Yucca' today (operator-writable); 'yucca_tf_dev' once the sietch-ceph service account is provisioned."
  type        = string
  default     = "Yucca"
}

variable "hosts" {
  description = <<-EOT
    Ordered list of hosts in this cluster. First host is the bootstrap node unless a different host has bootstrap=true.
    Each host:
      - name:       (optional) short identifier. If null, TF picks from wordlist.
                    Once deployed, do NOT change — drives hostname and all identity.
      - bond_ip:    primary IP address ansible connects to
      - bootstrap:  (optional) true for the cephadm bootstrap node; exactly one per cluster
      - roles:      list of Ceph roles (mon, mgr, osd, rgw); informational
  EOT
  type = list(object({
    name      = optional(string)
    bond_ip   = string
    bootstrap = optional(bool, false)
    roles     = optional(list(string), ["mon", "mgr", "osd", "rgw"])
  }))

  validation {
    condition     = length([for h in var.hosts : h if coalesce(h.bootstrap, false)]) <= 1
    error_message = "At most one host may have bootstrap = true."
  }
  validation {
    condition     = length(var.hosts) > 0
    error_message = "At least one host is required."
  }
}

variable "ansible_inventory_path" {
  description = "Absolute path to write the rendered inventory.ini."
  type        = string
}

variable "ansible_destroy_inventory_path" {
  description = "Absolute path to write the rendered inventory-destroy.ini."
  type        = string
}

variable "ansible_provision_inventory_path" {
  description = "Absolute path to write inventory-provision.ini. Only rendered when provision_profile is non-null."
  type        = string
}

variable "ansible_secrets_template_path" {
  description = "Absolute path to write the rendered secrets.yml.tpl (consumed by op inject at playbook time)."
  type        = string
}

variable "provision_profile" {
  description = <<-EOT
    Provisioning workflow for this cluster. Controls whether inventory-provision.ini is rendered
    and what SSH credentials it embeds. Valid values:
      - "debian-live"  : bare-metal Debian 12 live image (user/live); used by sietch.
      - null           : no ansible-driven provision step (e.g., Hetzner installimage);
                         inventory-provision.ini is NOT rendered.
  EOT
  type        = string
  default     = null
  validation {
    condition     = var.provision_profile == null || contains(["debian-live"], var.provision_profile)
    error_message = "provision_profile must be null or 'debian-live'."
  }
}

variable "name_seed" {
  description = "Optional seed to re-roll the cluster's wordlist auto-names. Do NOT bump once hosts are deployed — renames every auto-named host."
  type        = string
  default     = "v1"
}
