# Nodes are provisioned to maintenance mode out of band (runbook ./README.md:
# rescue → dd → reboot).

locals {
  kube_prefix = split("/", local.kube_cidr)[1] # 24

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
            mtu       = local.fabric_mtu # jumbo fabric (switch L2 9216, IRBs 9202)
            # Members by NIC driver (robust across PCI naming); explicit names as fallback.
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
              mtu       = local.fabric_mtu
              addresses = ["${w.fabric_ip}/${local.kube_prefix}"]
              # Pin fabric routes so kubelet→apiserver + geneve ride the fabric, not the mesh.
              routes = concat(
                [{ network = local.kube_cp_cidr, gateway = local.kube_gateway }],
                # spice RGW (michael S3 path).
                [{ network = local.cls1_public_cidr, gateway = local.kube_gateway }],
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

# Keyed by HOSTNAME, not list position — with count, a tfvars reorder destroyed
# (= RESET, wiping Mayastor/localpv data) every displaced live node.
resource "talos_machine_configuration_apply" "worker" {
  for_each = local.worker_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.worker.machine_configuration
  # provisioned=false: first apply targets the maintenance node at maint_ip;
  # later applies target the live node at fabric_ip (maint endpoint is gone once
  # installed). Flip provisioned in tfvars per worker as it comes up.
  node           = each.value.provisioned ? each.value.fabric_ip : each.value.maint_ip
  endpoint       = each.value.provisioned ? each.value.fabric_ip : each.value.maint_ip
  config_patches = local.worker_node_patches[each.key]
  apply_mode     = "auto"

  # reset=false: decommission must be a deliberate `talosctl reset`, never a TF
  # destroy side effect. NB: on_destroy is read from STATE — protects only after
  # one apply.
  on_destroy = {
    reboot   = true
    reset    = false
    graceful = false
  }

  depends_on = [talos_machine_bootstrap.this]

  lifecycle {
    # Empty setup key silently omits the netbird patch — an env-less apply would
    # strip NetBird from live workers. Fail loudly.
    precondition {
      condition     = length(var.netbird_talos_setup_key) > 0
      error_message = "netbird_talos_setup_key is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}
