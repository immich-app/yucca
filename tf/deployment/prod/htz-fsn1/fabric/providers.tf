# One junos provider per switch VC (spine = site .115; leaf n = .125+(n-1)*10);
# `terraform` NETCONF user, key rendered from 1P by the runner — never committed.
#
# commit_confirmed = 3: every commit auto-rolls-back in 3 min unless re-confirmed,
# so a mgmt-severing commit reverts itself. wait_percent = 0: confirm immediately —
# the confirm runs over a fresh connection so protection holds; a non-zero wait
# serializes badly (Junos won't take a new commit while one is pending).
provider "junos" {
  alias                         = "spine"
  ip                            = module.addr_site.spine_mgmt_ip # 10.40.5.115
  port                          = 830
  username                      = "terraform"
  sshkeyfile                    = var.netconf_ssh_key_path
  commit_confirmed              = 3
  commit_confirmed_wait_percent = 0
}

provider "junos" {
  alias                         = "leaf_cls1"
  ip                            = module.addr_cls1.leaf_mgmt_ip # 10.40.5.125
  port                          = 830
  username                      = "terraform"
  sshkeyfile                    = var.netconf_ssh_key_path
  commit_confirmed              = 3
  commit_confirmed_wait_percent = 0
}

provider "netbox" {
  server_url = var.netbox_url
  api_token  = var.netbox_token
}

# Hetzner Robot (mgmt.tf); creds = HETZNER_ROBOT_USERNAME/PASSWORD via op-run (tf/.env.prod).
provider "hetzner" {}

# 1P via OP_SERVICE_ACCOUNT_TOKEN (infra:apply escalates to the write SA); no Connect host.
provider "onepassword" {}
