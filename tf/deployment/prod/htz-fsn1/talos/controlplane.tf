# Nodes are provisioned to maintenance mode out of band (runbook ./README.md).

locals {
  cp_node_patches = { for hostname, n in local.cp_node_map : hostname => [
    # Install disk by SERIAL (never by name — enumeration swaps across boots).
    yamlencode({
      machine = { install = {
        diskSelector = { serial = n.install_serial }
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
            # Members by driver (ixgbe = the two 10G SFP+; onboard public NIC is e1000e).
            bond = {
              mode           = "802.3ad"
              lacpRate       = "fast"
              xmitHashPolicy = "layer3+4"
              miimon         = 100
              deviceSelectors = local.c.cp_bond_driver != null ? [{
                driver = local.c.cp_bond_driver
              }] : null
              interfaces = local.c.cp_bond_driver != null ? null : local.c.cp_bond_interfaces
            }
            vlans = [{
              vlanId    = module.addr_site.kube_cp_vlan_id # 11
              mtu       = local.fabric_mtu
              addresses = ["${n.cp_ip}/${local.kube_cp_prefix}"]
              # Pin the return route so apiserver→kubelet + geneve ride the fabric.
              routes = [{ network = local.kube_cidr, gateway = local.kube_cp_gw }]
              vip    = { ip = local.api_vip }
            }]
          }]
        }
      }
    }),
    yamlencode({ apiVersion = "v1alpha1", kind = "HostnameConfig", auto = "off", hostname = hostname }),
  ] }
}

# Keyed by HOSTNAME, not list position — a shift = replace = an etcd member reset.
resource "talos_machine_configuration_apply" "cp" {
  for_each = local.cp_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.cp.machine_configuration
  # provisioned=false: first apply targets maint_ip; later applies target the
  # live node at cp_ip. Flip provisioned in tfvars per CP as it comes up.
  node           = each.value.provisioned ? each.value.cp_ip : each.value.maint_ip
  endpoint       = each.value.provisioned ? each.value.cp_ip : each.value.maint_ip
  config_patches = local.cp_node_patches[each.key]
  apply_mode     = "auto"

  # reset=false: decommission must be `talosctl reset` (after `etcd leave`),
  # never a TF destroy side effect. on_destroy is read from STATE — protects
  # only after one apply.
  on_destroy = {
    reboot   = true
    reset    = false
    graceful = false
  }

  lifecycle {
    # Empty setup key silently omits the netbird patch — an env-less apply would
    # strip NetBird from live CPs, cutting the operators' kube-cp route. Fail loudly.
    precondition {
      condition     = length(var.netbird_talos_cp_setup_key) > 0
      error_message = "netbird_talos_cp_setup_key is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}
