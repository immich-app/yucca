# Declarative Talos cluster inventory for dev/talos stack.
# Adding a cluster = add an entry here + `tf:apply`.
# ansible_project_root is injected by terragrunt from the repo root.

clusters = {
  sietch = {
    domain           = "dev.austin.int.futo.cloud"
    environment      = "dev"
    datacenter       = "austin"
    provider_code    = "int"
    role_in_hostname = "talos"
    ansible_ssh_user = "ansible-iac"
    ansible_ssh_key  = "~/.ssh/id_ed25519_sietch"

    # The 3 Sietch hypervisors host both Ceph OSDs (existing) and
    # Talos VMs (this stack). Their hostnames stay <cluster>-ceph-<name>
    # (sietch-ceph-laurel/lawson/samara); Talos VMs are separate domains
    # under <cluster>-talos-<vm-name>.
    hypervisors = [
      { name = "laurel", bond_ip = "10.10.10.90" },
      { name = "lawson", bond_ip = "10.10.10.91" },
      { name = "samara", bond_ip = "10.10.10.92" },
    ]

    # Control-plane Virtual IP on VLAN 50. Reserved (outside DHCP pool).
    # The talos-bootstrap module patches CP nodes with this VIP via Talos's
    # `machine.network.interfaces[].vip.ip` on the enp1s0 entry — the same
    # NIC the kernel `ip=` cmdline configures.
    cp_vip = "10.50.0.10"

    vlans = {
      compute = {
        id         = 50
        bridge     = "br-vlan50"
        subnet     = "10.50.0.0/16"
        dhcp_start = "10.50.0.16"
        dhcp_end   = "10.50.4.255"
      }
      services = {
        id     = 51
        bridge = "br-vlan51"
        subnet = "10.51.0.0/16"
      }
    }

    talos_version = "1.13.3"

    # Image Factory schematic — bakes system extensions into the boot
    # assets: siderolabs/{qemu-guest-agent, util-linux-tools}. Regenerate at
    # https://factory.talos.dev if the extension set changes (ID is sha256
    # of the schematic), and update the image/kernel/initramfs checksums in
    # ansible group_vars to match.
    talos_schematic_id = "a7bcadbc1b6d03c0e687be3a5d9789ef7113362a6a1a038653dfd16283a92b6b"

    # Pin Kubernetes explicitly so version upgrades become intentional
    # commits rather than side-effects of talos_version bumps. v1.36.1 is
    # Talos v1.13.3's bundled K8s default (machinery constants); verify
    # via `talosctl images` on first bring-up and bump deliberately.
    kubernetes_version = "v1.36.1"

    # smoke = 1 CP + 1 worker  (laurel only — fast bring-up validation)
    # full  = 3 CP + 3 workers (production target — 1 CP + 1 worker per
    #         hypervisor, so each host is its own failure domain)
    profile = "full"

    # Talos VM nodes. Static IPs in 10.50.5.0/24 (outside the VLAN-50 DHCP
    # pool); each is pinned by the kernel `ip=` cmdline + machine config, so
    # TF dials known addresses with no discovery step. MUST stay in sync with
    # host_vars/<hypervisor>.yml (same name/IP/hypervisor).
    nodes = [
      # full + smoke (smoke = just cp1 + worker1 on laurel)
      { name = "cp1", role = "control-plane", hypervisor = "laurel", static_ip = "10.50.5.11", profiles = ["full", "smoke"] },
      { name = "worker1", role = "worker", hypervisor = "laurel", static_ip = "10.50.5.21", profiles = ["full", "smoke"] },

      # full only — one CP + one worker per remaining hypervisor
      { name = "cp2", role = "control-plane", hypervisor = "lawson", static_ip = "10.50.5.12", profiles = ["full"] },
      { name = "worker2", role = "worker", hypervisor = "lawson", static_ip = "10.50.5.22", profiles = ["full"] },
      { name = "cp3", role = "control-plane", hypervisor = "samara", static_ip = "10.50.5.13", profiles = ["full"] },
      { name = "worker3", role = "worker", hypervisor = "samara", static_ip = "10.50.5.23", profiles = ["full"] },
    ]

    # The talos-bootstrap module uses these when applying machine configs.
    # Defaults sane for sietch (/dev/vda virtio, no extra patches). Override
    # per cluster if needed (e.g. /dev/nvme0n1 for bare-metal Talos).
    install_disk   = "/dev/vda"
    config_patches = []
  }
}
