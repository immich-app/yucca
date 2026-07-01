# ── prod hybrid Talos cluster: `father` ──────────────────────────────────────
# Topology (see README.md): 3 Hetzner Cloud CP VMs + 3 Hetzner Robot bare-metal
# workers. CP↔worker rides the NetBird mesh; worker↔worker east-west rides the
# 50G fabric (kube VLAN 10) via Cilium BGP; etcd CP↔CP on a private hcloud subnet;
# API via a public Hetzner Cloud LB.
#
# Adding/replacing a node = edit here + `tf:plan` (CI applies). Workers must
# already be in Talos maintenance mode at their fabric_ip (see Phase-4 runbook).

cluster = {
  name               = "father" # prod K8s cluster (Star Wars; staging = luke)
  talos_version      = "1.13.4" # latest stable; default k8s = 1.36.1
  kubernetes_version = "v1.36.1"

  # The node extension set lives in schematic.yaml (managed via
  # talos_image_factory_schematic in image.tf) — no schematic id to paste here.
  install_disk = "/dev/nvme0n1" # worker install target (AX162-R: 2× NVMe; CP VMs boot from the snapshot)

  cilium_version = "1.19.5"
  hubble         = true

  # NetBird peer address range for this deployment (firewall trust for the mesh).
  netbird_node_cidr = "10.254.0.0/15"

  # ── Cloud control plane (Hetzner Cloud, fsn1) ──────────────────────────────
  cp_count       = 3
  cp_server_type = "ccx23" # 4 vCPU / 16 GB, dedicated x86
  cp_location    = "fsn1"
  cp_ip_offset   = 11 # CP private IPs → 10.40.11.11 / .12 / .13 (etcd)
  lb_type        = "lb11"
  lb_ip_offset   = 5     # API LB private IP → 10.40.11.5
  lb_public      = false # private-only LB; the API endpoint stays on the kube-cp net

  # ── Bare-metal workers (Hetzner Robot dedicated; sequential after mgmt-1/2) ──
  workers = [
    { fabric_ip = "10.40.10.11", maint_ip = "178.63.124.38", robot_id = 3008210 },
    { fabric_ip = "10.40.10.12", maint_ip = "178.63.124.37", robot_id = 3008211 },
    { fabric_ip = "10.40.10.13", maint_ip = "178.63.124.39", robot_id = 3008212 },
  ]
  # 2×25G Broadcom NICs (enp193s0f0np0/f1np1) enslaved into bond0 (tagged kube VLAN 10).
  # Selected by driver — robust across per-node PCI naming. eth0 (ixgbe 10G) stays the
  # DHCP public/egress NIC (default route + NetBird endpoint).
  worker_bond_driver              = "bnxt_en"
  worker_default_route_via_fabric = false
}

# Operator/CI sources allowed on the Talos host firewall (apid 50000 + apiserver
# 6443), on top of the node planes. NetBird peer range ONLY — no public IPs (the
# hcloud firewall also blocks public apiserver/apid; see hcloud-firewall.tf). A
# re-bootstrap dials apid on a CP public IP, so temporarily re-add the operator's
# /32 here (and open 50000 on the hcloud firewall) for that one step.
trusted_cidrs = ["10.254.0.0/15"]
