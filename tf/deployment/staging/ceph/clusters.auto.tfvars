# Declarative cluster inventory. Adding a cluster = add an entry here, let the
# infra.yml apply run (or `terragrunt apply`), then
# `ansible/ceph/scripts/render-inventories.sh staging`.
#
# sietch is the Austin cluster, promoted from dev to staging (same physical
# nodes, clean rebuild). Secrets live in yucca_tf_staging and are TF-managed
# here (manage_secrets = true in main.tf).

clusters = {
  sietch = {
    domain            = "staging.austin.int.futo.cloud"
    environment       = "staging"
    datacenter        = "austin"
    provider_code     = "int"
    role_in_hostname  = "ceph"
    ansible_ssh_user  = "ansible-iac"
    ansible_ssh_key   = "~/.ssh/id_ed25519_sietch"
    vault             = "yucca_tf_staging"
    provision_profile = "debian-live"
    hosts = [
      { name = "laurel", bond_ip = "10.10.10.90", bootstrap = true },
      { name = "lawson", bond_ip = "10.10.10.91" },
      { name = "samara", bond_ip = "10.10.10.92" },
    ]
  }
}
