variable "site" {
  type        = string
  default     = "htz-fsn1"
  description = <<-EOT
    Site slug. Selects the roster at tf/deployment/prod/<site>/mgmt-hosts.yaml and
    the inventory rendered under ansible/mgmt/inventories/<site>/.
  EOT
}
