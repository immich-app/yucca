# One junos provider instance per switch VC, host derived from the addressing
# module (spine = site .115; each cluster leaf = .125 + (n-1)*10). Auth is the
# dedicated `terraform` NETCONF user with an SSH key (path from var; rendered from
# 1Password by the mise/CI runner — never committed).

# commit_confirmed = N: every commit is a `commit confirmed N`, auto-rolled-back
# after N minutes unless the provider re-confirms. If an apply severs the NETCONF
# session (bad filter, interface, services change), the switch reverts itself —
# the management lifeline can't be permanently broken.
#
# wait_percent = 0: confirm IMMEDIATELY (no dead-wait between commit + confirm).
# Protection still holds — the confirm runs over a fresh connection, so a
# mgmt-breaking commit fails the confirm and rolls back. A non-zero wait only
# guards the rare "break manifests a few seconds late" case, and isn't worth the
# serialized dead-time (Junos won't accept a new commit while a confirmed one is
# pending, so the wait multiplies across every committed resource).
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

# Hetzner Robot API — mgmt-host reprovisioning (mgmt.tf). Credentials come from
# the env (HETZNER_ROBOT_USERNAME/PASSWORD), injected by op-run from tf/.env.prod;
# no secrets in config.
provider "hetzner" {}

# 1Password — stores the TF-generated provisioning key (mgmt.tf) in the env vault.
# Authenticates with OP_SERVICE_ACCOUNT_TOKEN (the `infra:apply` task escalates to
# the write-capable SA pulled from the vault); no Connect host needed.
provider "onepassword" {}
