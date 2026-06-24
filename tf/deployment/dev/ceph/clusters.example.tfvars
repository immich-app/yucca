# Example cluster spec, NOT auto-loaded (only *.auto.tfvars is). Kept as a
# reference for clusters that exist but are not currently managed by this stack.
#
# painbox: a single-node Ceph Tentacle cluster on Bookworm (1x SX295) in
# Hetzner Helsinki, reprovisioned end to end via Hetzner installimage (hence no
# provision_profile; installimage handles partitioning + base OS). It is in
# active use by Zack, so it is excluded from clusters.auto.tfvars. To bring it
# back under management, move this entry into the clusters map there, run
# `terragrunt apply`, then render. Its 1Password items already exist in
# yucca_tf_dev and are left untouched either way.
#
# clusters = {
#   painbox = {
#     domain           = "dev.hel.htz.futo.cloud"
#     environment      = "dev"
#     datacenter       = "hel"
#     provider_code    = "htz"
#     role_in_hostname = "ceph"
#     ansible_ssh_user = "root"
#     ansible_ssh_key  = "~/.ssh/id_ed25519_painbox"
#     vault            = "yucca_tf_dev"
#     # Auto-picked wordlist name: "evelyn" -> painbox-ceph-evelyn.
#     hosts = [
#       { bond_ip = "157.180.105.198", bootstrap = true },
#     ]
#   }
# }
