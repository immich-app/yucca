# ── Bare-metal workers ───────────────────────────────────────────────────────
# Applied over apid to nodes already in Talos maintenance mode at their fabric_ip
# (reachable from the TF runner via NetBird → mgmt → fabric `kube` net). After the
# install+reboot they keep that fabric IP and join the NetBird mesh.
#
#   bond0 (2×25G LACP) → vlan 10 (kube) = fabric_ip   — nodeIP + worker east-west (50G)
#   default route via the kube IRB gateway (fabric transit) for egress
#
# Workers are NOT NetBird peers: nodeIP = fabric_ip, so Cilium autoDirectNodeRoutes
# routes pod east-west directly over the shared VLAN-10 L2 (no BGP). The apiserver
# reaches worker kubelets via the CPs' NetBird route to the kube net (mgmt routers).
#
# Workers are PROVISIONED to maintenance mode out of band — see the Phase-4 runbook
# (./README.md): Hetzner rescue → dd the Talos metal image → bring up bond0.10 at
# fabric_ip. This stack assumes they're already there.

locals {
  kube_prefix = split("/", local.kube_cidr)[1] # 24

  worker_node_patches = [for j, w in var.cluster.workers : [
    yamlencode({
      machine = {
        network = {
          interfaces = [{
            interface = "bond0"
            dhcp      = false
            bond = {
              interfaces     = var.cluster.worker_bond_interfaces
              mode           = "802.3ad"
              lacpRate       = "fast"
              xmitHashPolicy = "layer3+4"
              miimon         = 100
            }
            vlans = [{
              vlanId    = module.addr_site.kube_vlan_id # 10
              addresses = ["${w.fabric_ip}/${local.kube_prefix}"]
              routes = var.cluster.worker_default_route_via_fabric ? [
                { network = "0.0.0.0/0", gateway = local.kube_gateway },
              ] : []
            }]
          }]
        }
      }
    }),
    yamlencode({ apiVersion = "v1alpha1", kind = "HostnameConfig", auto = "off", hostname = local.worker_hostnames[j] }),
  ]]
}

resource "talos_machine_configuration_apply" "worker" {
  count = length(var.cluster.workers)

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.worker.machine_configuration
  node                        = var.cluster.workers[count.index].fabric_ip
  endpoint                    = var.cluster.workers[count.index].fabric_ip
  config_patches              = local.worker_node_patches[count.index]
  apply_mode                  = "auto"

  on_destroy = {
    reboot   = true
    reset    = true
    graceful = false
  }

  # Workers join only after the apiserver is up (bootstrap), or they sit in
  # maintenance waiting for it.
  depends_on = [talos_machine_bootstrap.this]
}
