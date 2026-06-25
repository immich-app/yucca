variable "site_id" {
  type        = number
  default     = 40
  description = "Site id (htz-fsn1 = 40)."
}

variable "site_code" {
  type        = string
  default     = "FSN1"
  description = "Short site code for NetBox VLAN naming."
}

variable "netconf_ssh_key_path" {
  type        = string
  description = <<-EOT
    Filesystem path to the dedicated `terraform` NETCONF SSH private key. The
    runner renders it from 1Password (op://yucca_tf_prod/NET_SWITCHES_TERRAFORM_SSH_PRIVATE_KEY)
    to a temp file and sets TF_VAR_netconf_ssh_key_path. Local dev can point at
    ~/.ssh/yucca-junos-tf.
  EOT
}

variable "netbox_url" {
  type        = string
  default     = "https://netbox.futoinfra.com"
  description = "NetBox base URL."
}

variable "netbox_token" {
  type        = string
  sensitive   = true
  description = "NetBox API token (from 1Password via op run)."
}

variable "netbox_site_name" {
  type        = string
  default     = "HTZ-FSN1"
  description = "NetBox site name (created by the netbox module)."
}

variable "netbox_site_slug" {
  type        = string
  default     = "htz-fsn1"
  description = "NetBox site slug; also the device-name prefix."
}

variable "cls1_leaf_serials" {
  type        = list(string)
  description = "cls1 leaf VC member chassis serials (member 0, member 1)."
}

variable "spine_vc_serials" {
  type        = list(string)
  description = "Spine (corenetsw) VC member chassis serials (member 0, member 1)."
}

# ── mgmt-host reprovisioning (mgmt.tf) ───────────────────────────────────────
variable "op_vault" {
  type        = string
  default     = "yucca_tf_prod"
  description = "1Password vault (env-appropriate) the TF-generated provisioning key is written to."
}

variable "mgmt_dist" {
  type        = string
  default     = "Debian 13 base"
  description = "Hetzner robot Linux auto-install image (must match an available `dist` exactly; see GET /boot/<n>/linux)."
}

variable "mgmt_reprovision_targets" {
  type        = list(string)
  default     = []
  description = <<-EOT
    mgmt host keys (see local.mgmt_hosts in mgmt.tf) to ARM for a fresh OS install
    on next boot. DESTRUCTIVE once the host is rebooted. Keep empty except during a
    planned reprovision; set to the host(s) being reprovisioned, apply, then reboot.
  EOT
}
