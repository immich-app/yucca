# One junos-qfx provider instance per switch VC, host derived from the addressing
# module (spine = site .115; each cluster leaf = .125 + (n-1)*10). Auth is the
# dedicated `terraform` NETCONF user with an SSH key (path from var; rendered from
# 1Password by the mise/CI runner — never committed).

provider "junos-qfx" {
  alias    = "spine"
  host     = module.addr_site.spine_mgmt_ip # 10.40.5.115
  port     = 830
  username = "terraform"
  sshkey   = var.netconf_ssh_key_path
}

provider "junos-qfx" {
  alias    = "leaf_cls1"
  host     = module.addr_cls1.leaf_mgmt_ip # 10.40.5.125
  port     = 830
  username = "terraform"
  sshkey   = var.netconf_ssh_key_path
}

provider "netbox" {
  server_url = var.netbox_url
  api_token  = var.netbox_token
}

# Hetzner Robot API — mgmt-host reprovisioning (mgmt.tf). Credentials come from
# the env (HETZNER_ROBOT_USERNAME/PASSWORD), injected by op-run from tf/.env.prod;
# no secrets in config.
provider "hetzner" {}

# 1Password — stores the TF-generated provisioning key (mgmt.tf) in the env vault.
# Authenticates with OP_SERVICE_ACCOUNT_TOKEN (the `infra:apply` task escalates to
# the write-capable SA pulled from the vault); no Connect host needed.
provider "onepassword" {}
