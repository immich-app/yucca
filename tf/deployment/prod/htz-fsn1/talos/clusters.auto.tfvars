# ── prod bare-metal Talos cluster: `father` ──────────────────────────────────
# Topology (see README.md): 3 Hetzner Robot bare-metal CPs on the kube-cp fabric
# VLAN 11 (etcd + API VIP 10.40.11.5) + 3 Hetzner Robot bare-metal workers on the
# kube fabric VLAN 10. The spine routes kube↔kube-cp between its IRBs; NetBird
# stays on every node as the operator/backup plane (kube-cp is routed to the mesh
# via the CPs). No Hetzner Cloud anywhere — the cloud CP VMs + API LB are retired.
#
# Adding/replacing a node = edit here + `tf:plan` (CI applies). Nodes must
# already be in Talos maintenance mode at their maint_ip (see the runbook).

cluster = {
  name               = "father" # prod K8s cluster (Star Wars; staging = luke)
  talos_version      = "1.13.4" # latest stable; default k8s = 1.36.1
  kubernetes_version = "v1.36.1"

  # The node extension set lives in schematic.yaml (managed via
  # talos_image_factory_schematic in image.tf) — no schematic id to paste here.

  cilium_version = "1.19.5"
  hubble         = true

  # NetBird peer address range for this deployment (firewall trust for the mesh).
  netbird_node_cidr = "10.254.0.0/15"

  # ── Bare-metal control planes (Hetzner Robot; kube-cp VLAN 11, gw .1 = spine) ──
  # `name` keys the apply resources (stable across list edits). VIP 10.40.11.5
  # (= the retired hcloud LB IP, so api_dns_name carried over unchanged).
  # provisioned=false → the one-time install apply dials maint_ip (maintenance
  # mode); flip true per node as it comes up.
  cps = [
    { name = "harlan", cp_ip = "10.40.11.11", maint_ip = "178.63.124.20", robot_id = 3027819, install_serial = "17451A00D9F8" },
    { name = "imelda", cp_ip = "10.40.11.12", maint_ip = "178.63.124.21", robot_id = 3027863, install_serial = "1708162471F6" },
    { name = "roscoe", cp_ip = "10.40.11.13", maint_ip = "178.63.124.22", robot_id = 3028524, install_serial = "18201C72C94D" },
  ]
  # 2×10G Intel 82599ES SFP+ (ixgbe) enslaved into bond0 (tagged kube-cp VLAN 11,
  # spine port-0 breakout ae4-6). The onboard 1G (e1000e) stays the DHCP
  # public/egress NIC (default route + NetBird endpoint).
  cp_bond_driver = "ixgbe"
  vip_offset     = 5 # API VIP → 10.40.11.5

  # ── Bare-metal workers (Hetzner Robot; kube VLAN 10) ─────────────────────────
  workers = [
    { name = "jeanne", fabric_ip = "10.40.10.11", maint_ip = "178.63.124.38", robot_id = 3008210, install_serial = "S64GNNFX503099" },
    { name = "sheron", fabric_ip = "10.40.10.12", maint_ip = "178.63.124.37", robot_id = 3008211, install_serial = "S64GNJ0WC25870" },
    { name = "dianna", fabric_ip = "10.40.10.13", maint_ip = "178.63.124.39", robot_id = 3008212, install_serial = "S64GNNFX500881" },
  ]
  # 2×25G Broadcom NICs (enp193s0f0np0/f1np1) enslaved into bond0 (tagged kube VLAN 10).
  # Selected by driver — robust across per-node PCI naming. eth0 (ixgbe 10G) stays the
  # DHCP public/egress NIC (default route + NetBird endpoint).
  worker_bond_driver              = "bnxt_en"
  worker_default_route_via_fabric = false
}

# Operator/CI sources allowed on the Talos host firewall (apid 50000 + apiserver
# 6443), on top of the node planes. NetBird peer range ONLY — no public IPs.
# Operators reach the CPs over the NetBird kube-cp route (the CPs are the route
# peers); a re-bootstrap that must dial apid before the mesh is up goes through
# a maint_ip (maintenance mode is unauthenticated — no firewall yet).
trusted_cidrs = ["10.254.0.0/15"]
