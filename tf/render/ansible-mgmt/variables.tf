variable "partition" {
  type        = string
  default     = "prod"
  description = <<-EOT
    Partition slug. Combined with region, selects the roster at
    tf/deployment/<partition>/<region>/mgmt-hosts.yaml.
  EOT
}

variable "region" {
  type        = string
  default     = "htz-fsn1"
  description = <<-EOT
    Region slug. Selects the roster at tf/deployment/<partition>/<region>/mgmt-hosts.yaml
    and the inventory rendered under ansible/mgmt/inventories/<region>/.
  EOT
}
