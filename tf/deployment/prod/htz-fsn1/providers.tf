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
