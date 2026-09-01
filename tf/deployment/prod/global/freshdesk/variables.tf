variable "partition" {
  description = "Partition slug, injected by terragrunt from the path (deployment/<partition>/global/freshdesk)."
  type        = string
}

variable "region" {
  description = "Region slug (global for this partition-wide stack)."
  type        = string
  default     = null
}

variable "stack" {
  description = "Stack name (freshdesk)."
  type        = string
  default     = null
}

variable "slug" {
  description = "Canonical <partition>-<region> slug."
  type        = string
  default     = null
}

variable "role" {
  description = "Region role (null for the global pseudo-region)."
  type        = string
  default     = null
}

variable "site_id" {
  description = "Fabric site id (null for global)."
  type        = number
  default     = null
}

variable "datacenter" {
  description = "Datacenter segment of the region FQDN (null for global)."
  type        = string
  default     = null
}

variable "provider_code" {
  description = "Provider segment of the region FQDN (null for global)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Region FQDN suffix (null for global)."
  type        = string
  default     = null
}

variable "yucca_freshdesk_url" {
  description = "Freshdesk base URL (manual YUCCA_FRESHDESK_URL item). Empty = the group/rule stay unmanaged."
  type        = string
  default     = ""
}

variable "yucca_freshdesk_admin_api_key" {
  description = "Freshdesk API key of an ADMIN agent, used only by this stack for group/rule CRUD (manual YUCCA_FRESHDESK_ADMIN_API_KEY item; never lands in a cluster)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "yucca_app_domain" {
  description = "Public app domain the webhook rule targets. Must match APP_DOMAIN in the partition's cluster-settings.generated.yaml."
  type        = string
  default     = "backups.futo.cloud"
}
