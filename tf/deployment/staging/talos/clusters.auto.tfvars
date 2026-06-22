# Declarative bare-metal Talos cluster inventory for the staging/talos stack.
# Adding/modifying a cluster = edit here + `tf:apply`.
#
# These 3 Dell nodes were PXE/ISO-booted into Talos maintenance mode. The
# `address` of each is its current maintenance IP, which is ALSO pinned as
# the post-install static IP on bond0 — so addressing is stable and TF stays
# reachable across the install reboot.

clusters = {
  yucca-staging = {
    talos_version      = "1.13.4" # latest stable (v1.13.4); default k8s = 1.36.1
    kubernetes_version = "v1.36.1"

    # Image Factory schematic → metal installer with CPU microcode + tools:
    #   siderolabs/intel-ucode      (Intel Xeon microcode — these are GenuineIntel)
    #   siderolabs/util-linux-tools (fstrim et al.)
    # Regenerate at https://factory.talos.dev if the extension set changes.
    talos_schematic_id = "9a8175a3e290fca4844ba6953ebecbe575bc8a830dfb08f48039ab319bdc72e8"

    # Install target — WIPED. /dev/sda is the 240GB DELLBOSS on these nodes;
    # the two 1.6TB NVMe drives (nvme0n1/nvme1n1) are left untouched for data.
    install_disk = "/dev/sda"

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
      { name = "staging-cp1", role = "control-plane", address = "10.10.10.47" },
      { name = "staging-cp2", role = "control-plane", address = "10.10.10.242" },
      { name = "staging-cp3", role = "control-plane", address = "10.10.10.117" },
    ]
  }
}
