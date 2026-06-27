# ── Partition / region / stack identity (injected by the root terragrunt from
# the path; region metadata merged from region.hcl). site_id is also a region
# field — kept below with its existing default 40 (region.hcl supplies 40 too).
variable "partition" {
  description = "Partition slug (prod), from deployment/<partition>/..."
  type        = string
  default     = null
}

variable "region" {
  description = "Region slug (htz-fsn1)."
  type        = string
  default     = null
}

variable "stack" {
  description = "Stack name (fabric)."
  type        = string
  default     = null
}

variable "slug" {
  description = "Canonical <partition>-<region> slug (prod-htz-fsn1)."
  type        = string
  default     = null
}

variable "role" {
  description = "Region role: primary|secondary."
  type        = string
  default     = null
}

variable "datacenter" {
  description = "Datacenter segment of the region FQDN (fsn1)."
  type        = string
  default     = null
}

variable "provider_code" {
  description = "Provider segment of the region FQDN (htz)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Region FQDN suffix."
  type        = string
  default     = null
}

variable "site_id" {
  type        = number
  default     = 40
  description = "Site id (htz-fsn1 = 40). Also supplied by region.hcl."
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
