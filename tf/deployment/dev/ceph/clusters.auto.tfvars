# Declarative cluster inventory. Adding a cluster = add an entry here + `tofu apply`.
# ansible_project_root is injected by terragrunt from the repo root.

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

  painbox = {
    domain           = "dev.hel.htz.futo.cloud"
    environment      = "dev"
    datacenter       = "hel"
    provider_code    = "htz"
    role_in_hostname = "ceph"
    ansible_ssh_user = "root"
    ansible_ssh_key  = "~/.ssh/id_ed25519_painbox"
    vault            = "yucca_tf_dev"
    # Painbox runs Ceph Tentacle on Bookworm (1× SX295, single-node).
    # Reprovisioned end-to-end via Hetzner installimage; no provision_profile
    # because Hetzner installimage handles partitioning + base OS install.
    # Auto-picked wordlist name: "evelyn" → painbox-ceph-evelyn.
    hosts = [
      { bond_ip = "157.180.105.198", bootstrap = true },
    ]
  }
}
