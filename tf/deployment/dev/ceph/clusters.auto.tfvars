# Declarative cluster inventory. Adding a cluster = add an entry here, run
# `terragrunt apply`, then `ansible/ceph/scripts/render-inventories.sh dev`.
#
# painbox is intentionally NOT managed here right now: it is in active use by
# Zack for other purposes, so this stack must not render or reconcile it. Its
# spec is kept as a reference in clusters.example.tfvars (not auto-loaded). Its
# 1Password items are left untouched.

clusters = {
  sietch = {
    domain            = "dev.austin.int.futo.cloud"
    environment       = "dev"
    datacenter        = "austin"
    provider_code     = "int"
    role_in_hostname  = "ceph"
    ansible_ssh_user  = "ansible-iac"
    ansible_ssh_key   = "~/.ssh/id_ed25519_sietch"
    vault             = "yucca_tf_dev"
    provision_profile = "debian-live"
    hosts = [
      { name = "laurel", bond_ip = "10.10.10.90", bootstrap = true },
      { name = "lawson", bond_ip = "10.10.10.91" },
      { name = "samara", bond_ip = "10.10.10.92" },
    ]
  }
}
