# Declarative bare-metal Talos cluster inventory for the staging/talos stack.
# Adding/modifying a cluster = edit here + `tf:apply`.
#
# These 3 Dell nodes were PXE/ISO-booted into Talos maintenance mode. The
# `address` of each is its current maintenance IP, which is ALSO pinned as
# the post-install static IP on bond0 — so addressing is stable and TF stays
# reachable across the install reboot.

clusters = {
  # Star Wars-themed cluster name (staging = luke). Node hostnames derive as
  # yucca-int-aus-luke-k8s-<name> (name auto-picked from the shared inventory).
  luke = {
    talos_version      = "1.13.4" # latest stable (v1.13.4); default k8s = 1.36.1
    kubernetes_version = "v1.36.1"

    # Image Factory schematic → metal installer with CPU microcode + tools:
    #   siderolabs/intel-ucode      (Intel Xeon microcode — these are GenuineIntel)
    #   siderolabs/util-linux-tools (fstrim et al.)
    #   siderolabs/iscsi-tools      (Longhorn volume attachment)
    #   siderolabs/netbird          (node-level NetBird overlay; configured via the
    #                                ExtensionServiceConfig the module appends when
    #                                netbird_talos_setup_key is set — see main.tf)
    # Regenerate at https://factory.talos.dev if the extension set changes.
    # NB: adding an extension (iscsi-tools, netbird, …) needs a node `talosctl
    # upgrade --image factory.talos.dev/metal-installer/<id>:v<ver>`, not just a
    # config apply. Runbook: ansible/talos/docs/runbooks/netbird-extension-upgrade.md
    talos_schematic_id = "f141fc2a08d5a459a80d871faa48d7dc92bc354e4faf6cdbafe1cc0fac717991"

    # Install target — WIPED. /dev/sda is the 240GB DELLBOSS on these nodes;
    # the two 1.6TB NVMe drives (nvme0n1/nvme1n1) back the OpenEBS LocalPV
    # StorageClasses (openebs-spare-disk / -2) via the Talos UserVolumes below.
    install_disk = "/dev/sda"

    # OpenEBS LocalPV hostpath backing storage (replaces Longhorn). One Talos
    # UserVolume per spare NVMe, each auto-mounted at /var/mnt/<name> — matching
    # the BasePath of the openebs-spare-disk / -2 StorageClasses
    # (kubernetes/apps/base/openebs). OpenEBS is node-local: no node labels, no
    # iscsi, no replicated block layer (CNPG replicates at the app layer).
    # NB: the schematic still ships siderolabs/iscsi-tools (vestigial now that
    #     Longhorn is gone) — drop it on the next schematic regen + node upgrade.
    # NB: the NVMes currently hold Longhorn partitions; wipe them (talosctl wipe
    #     disk nvme0n1/nvme1n1, or a node reset) before this applies cleanly.
    config_patches = [
      <<-EOT
      apiVersion: v1alpha1
      kind: UserVolumeConfig
      name: local-hostpath
      provisioning:
        diskSelector:
          match: disk.dev_path == '/dev/nvme0n1'
        minSize: 100GB
        grow: true
      EOT
      ,
      <<-EOT
      apiVersion: v1alpha1
      kind: UserVolumeConfig
      name: local-hostpath-2
      provisioning:
        diskSelector:
          match: disk.dev_path == '/dev/nvme1n1'
        minSize: 100GB
        grow: true
      EOT
      ,
      # Spegel (cluster-local P2P image mirror) prereq: keep unpacked layers on disk
      # so a node has something to serve to peers (Talos discards them by default).
      # Talos already exposes containerd's registry config_path at /etc/cri/conf.d/hosts
      # where Spegel writes its hosts.d mirrors. Only images pulled AFTER this lands are
      # shareable, and a containerd restart (node reboot) is needed to take effect.
      <<-EOT
      machine:
        files:
          - path: /etc/cri/conf.d/20-customization.part
            op: create
            content: |
              [plugins."io.containerd.cri.v1.images"]
                discard_unpacked_layers = false
      EOT
      ,
      # Open the Spegel registry hostPort (30020) so a node can fetch unpacked layers
      # from the peer that has them (advertised as PEER_IP:30020). Sources: the node
      # subnet + pod CIDR (10.244.0.0/16, module default). The host ingress firewall is
      # default-deny (enable_ingress_firewall = true).
      <<-EOT
      apiVersion: v1alpha1
      kind: NetworkRuleConfig
      name: spegel-registry
      portSelector:
        ports:
          - 30020
        protocol: tcp
      ingress:
        - subnet: 10.10.10.0/24
        - subnet: 10.244.0.0/16
      EOT
    ]

    # Compact 3-node cluster: every node is a control-plane and also runs
    # workloads (etcd HA quorum across all three).
    allow_scheduling_on_control_planes = true

    # CNI: Cilium with kube-proxy replacement (Talos sets cni:none +
    # proxy.disabled; Cilium is installed via Helm in this same apply and
    # uses KubePrism localhost:7445). Hubble flow visibility + relay on.
    cni                = "cilium"
    disable_kube_proxy = true
    cilium_version     = "1.19.5" # latest stable
    hubble             = true

    # Talos host ingress firewall: default-deny + allow-lists for apid,
    # kubelet, cilium-vxlan/health + hubble-peer (all nodes) and trustd,
    # apiserver, etcd (CPs). apid + apiserver also trust the Tailscale ranges
    # (trust_tailscale). ⚠️ The host running `tf apply` must have a source IP
    # inside 10.10.10.0/24 (or add its subnet to trusted_cidrs) — otherwise
    # apid is blocked and bootstrap hangs.
    enable_ingress_firewall = true
    trusted_cidrs           = []   # add operator/jump-host subnet if applying off-LAN
    trust_tailscale         = true # allow 100.64.0.0/10 + fd7a:115c:a1e0::/48 on apid + apiserver

    # Layer-2 control-plane VIP — a free, un-leased address in the node subnet.
    cluster_vip = "10.10.10.15"

    gateway     = "10.10.10.1"
    subnet_cidr = "10.10.10.0/24"

    # Bond both physical NICs. Initial bring-up uses active-backup — it works
    # on plain access ports with NO switch change, so there's no connectivity
    # gap and no install-timing hazard. Migrate to 802.3ad later (rolling,
    # node-by-node) once the switch ports are converted to LACP port-channels:
    # flip mode to "802.3ad" and re-apply. The lacp_rate/xmit_hash_policy below
    # are pre-staged for that flip (ignored while mode = active-backup).
    bond = {
      name             = "bond0"
      interfaces       = ["eno1np0", "eno2np1"]
      mode             = "active-backup"
      lacp_rate        = "fast"
      xmit_hash_policy = "layer3+4"
    }

    nodes = [
      { role = "control-plane", address = "10.10.10.47" },
      { role = "control-plane", address = "10.10.10.242" },
      { role = "control-plane", address = "10.10.10.117" },
    ]
  }
}
