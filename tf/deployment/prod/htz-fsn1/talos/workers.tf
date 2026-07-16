# ── Bare-metal workers ───────────────────────────────────────────────────────
# Applied over apid to nodes already in Talos maintenance mode at their fabric_ip
# or maint_ip (see below). After the install+reboot they keep that fabric IP and
# join the NetBird mesh (operator/backup plane only).
#
#   bond0 (2×25G LACP) → vlan 10 (kube) = fabric_ip — nodeIP + worker east-west (50G)
#   route to kube-cp (apiserver + VIP) via the kube IRB (10.40.10.1) — the fabric
#   path to the control plane; the old wt0 (NetBird) route is retired
#   default route via the Hetzner public NIC (DHCP) for egress
#
# Workers are PROVISIONED to maintenance mode out of band — see the runbook
# (./README.md): Hetzner rescue → dd the Talos metal image → reboot. This stack
# assumes they're already there.

locals {
  kube_prefix = split("/", local.kube_cidr)[1] # 24

  # Keyed by hostname (worker_node_map) — same stable key as the apply resource.
  worker_node_patches = { for hostname, w in local.worker_node_map : hostname => [
    # Install disk by SERIAL (never by name — enumeration swaps across boots).
    yamlencode({
      machine = { install = {
        diskSelector = { serial = w.install_serial }
        image        = local.install_image
      } }
    }),
    yamlencode({
      machine = {
        network = {
          interfaces = [{
            interface = "bond0"
            dhcp      = false
            # Bond members selected by NIC driver (worker_bond_driver, e.g. bnxt_en) —
            # robust across per-node PCI naming; falls back to explicit Talos names.
            bond = {
              mode           = "802.3ad"
              lacpRate       = "fast"
              xmitHashPolicy = "layer3+4"
              miimon         = 100
              deviceSelectors = var.cluster.worker_bond_driver != null ? [{
                driver = var.cluster.worker_bond_driver
              }] : null
              interfaces = var.cluster.worker_bond_driver != null ? null : var.cluster.worker_bond_interfaces
            }
            vlans = [{
              vlanId    = module.addr_site.kube_vlan_id # 10
              addresses = ["${w.fabric_ip}/${local.kube_prefix}"]
              # kube-cp (apiserver + API VIP) lives one IRB away — pin the route so
              # kubelet→apiserver + geneve to the CPs ride the fabric, not the mesh.
              routes = concat(
                [{ network = local.kube_cp_cidr, gateway = local.kube_gateway }],
                var.cluster.worker_default_route_via_fabric ? [
                  { network = "0.0.0.0/0", gateway = local.kube_gateway },
                ] : [],
              )
            }]
          }]
        }
      }
    }),
    yamlencode({ apiVersion = "v1alpha1", kind = "HostnameConfig", auto = "off", hostname = hostname }),
  ] }
}

# Keyed by HOSTNAME, not list position: removing or reordering a worker in
# tfvars must never shift another node's resource address — with count, a shift
# destroyed (= RESET, wiping Mayastor/localpv data) every displaced live node.
# Matches the talos-baremetal module's worker_node_map pattern.
resource "talos_machine_configuration_apply" "worker" {
  for_each = local.worker_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.worker.machine_configuration
  # The FIRST apply targets the maintenance-mode node at its Hetzner public IP (DHCP,
  # provisioned=false); the config brings up bond0.10 at fabric_ip + joins NetBird and
  # the node reboots into the cluster. Every later apply targets the LIVE node at its
  # fabric IP (over the NetBird kube route) — the maintenance endpoint no longer
  # exists once installed. Flip provisioned in tfvars per worker as it comes up.
  node           = each.value.provisioned ? each.value.fabric_ip : each.value.maint_ip
  endpoint       = each.value.provisioned ? each.value.fabric_ip : each.value.maint_ip
  config_patches = local.worker_node_patches[each.key]
  apply_mode     = "auto"

  # reset=false: decommissioning a Mayastor-bearing node must be a deliberate
  # `talosctl reset`, never a terraform destroy side effect (a removed tfvars
  # entry now just reboots the node out of management). NB: on_destroy is read
  # from STATE, so this protects only after it has been applied once.
  on_destroy = {
    reboot   = true
    reset    = false
    graceful = false
  }

  # Workers join only after the apiserver is up (bootstrap), or they sit in
  # maintenance waiting for it.
  depends_on = [talos_machine_bootstrap.this]

  lifecycle {
    # worker_netbird_patch is silently OMITTED when the setup key is "" (the
    # credential-less validate default) — an env-less apply would strip NetBird
    # from the live worker configs. Fail loudly instead.
    precondition {
      condition     = length(var.netbird_talos_setup_key) > 0
      error_message = "netbird_talos_setup_key is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}
