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

variable "fabric_users" {
  description = "Login users (name -> rights + SSH public keys) applied to every VC."
  type = map(object({
    class            = string
    uid              = optional(number)
    full_name        = optional(string)
    ssh_ed25519_keys = optional(list(string), [])
    ssh_rsa_keys     = optional(list(string), [])
  }))
}

variable "fabric_login_classes" {
  description = "Optional custom login classes -> permissions."
  type = map(object({
    permissions = list(string)
  }))
  default = {}
}

variable "cls1_leaf_serials" {
  type        = list(string)
  description = "cls1 leaf VC member chassis serials (member 0, member 1)."
}

variable "spine_vc_serials" {
  type        = list(string)
  description = "Spine (corenetsw) VC member chassis serials (member 0, member 1)."
}
