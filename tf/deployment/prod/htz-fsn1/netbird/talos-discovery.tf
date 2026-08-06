# Feeds the dns.tf node records so names/IPs live in ONE place. Greenfield: set
# talos_discovery_enabled = false for bring-up, flip after the cluster stack lands.
variable "talos_discovery_enabled" {
  type    = bool
  default = true
}

data "terraform_remote_state" "talos" {
  count   = var.talos_discovery_enabled ? 1 : 0
  backend = "s3"
  config = {
    bucket = "yucca-tf-state"
    key    = "yucca/${var.partition}/${var.region}/talos/terraform.tfstate"
    region = "eu-west-par"
    endpoints = {
      s3 = "https://s3.eu-west-par.io.cloud.ovh.net/"
    }
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    use_path_style              = true
  }
}

locals {
  talos_kube   = var.talos_discovery_enabled ? data.terraform_remote_state.talos[0].outputs.discovery.kubernetes : null
  cluster_name = var.talos_discovery_enabled ? local.talos_kube.cluster_name : "father"
}
