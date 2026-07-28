# ── Bare-metal control planes ────────────────────────────────────────────────
# Applied over apid to nodes already in Talos maintenance mode at their maint_ip
# (Hetzner public DHCP on the onboard 1G NIC). After the install+reboot they hold
# their kube-cp VLAN address and join the NetBird mesh.
#
#   bond0 (2×10G LACP, ixgbe) → vlan 11 (kube-cp) = cp_ip — etcd + apiserver + VIP
#   route to the kube VLAN via the kube-cp IRB (10.40.11.1) — apiserver→kubelet
#   default route via the onboard 1G public NIC (DHCP) — egress + NetBird endpoint
#
# The API VIP (10.40.11.5) is Talos-managed on the VLAN: etcd elects one holder,
# so it's only up while the cluster is healthy — exactly what the api_dns_name
# record points at.
#
# CPs are PROVISIONED to maintenance mode out of band — see the runbook
# (./README.md): Hetzner rescue → dd the Talos metal image → reboot. This stack
# assumes they're already there.

locals {
  # Keyed by hostname (cp_node_map) — same stable key as the apply resource.
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
            # Bond members selected by NIC driver (cp_bond_driver, ixgbe) — exactly
            # the two 10G SFP+ ports; the onboard 1G public NIC is e1000e.
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
              # The workers live one IRB away — pin the return route so
              # apiserver→kubelet + geneve ride the fabric, not the mesh.
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

# Keyed by HOSTNAME, not list position: removing or reordering a CP in tfvars
# must never shift another node's resource address (a shift = replace = an etcd
# member reset). Matches the workers.tf pattern.
resource "talos_machine_configuration_apply" "cp" {
  for_each = local.cp_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.cp.machine_configuration
  # The FIRST apply targets the maintenance-mode node at its Hetzner public IP
  # (provisioned=false); the config brings up bond0.11 at cp_ip + joins NetBird and
  # the node reboots into the cluster. Every later apply targets the LIVE node at
  # its kube-cp IP (over the NetBird kube-cp route). Flip provisioned in tfvars per
  # CP as it comes up.
  node           = each.value.provisioned ? each.value.cp_ip : each.value.maint_ip
  endpoint       = each.value.provisioned ? each.value.cp_ip : each.value.maint_ip
  config_patches = local.cp_node_patches[each.key]
  apply_mode     = "auto"

  # reset=false: decommissioning an etcd member must be a deliberate
  # `talosctl reset` (after `etcd leave`), never a terraform destroy side effect.
  # NB: on_destroy is read from STATE, so this protects only after it has been
  # applied once.
  on_destroy = {
    reboot   = true
    reset    = false
    graceful = false
  }

  lifecycle {
    # cp_netbird_patch is silently OMITTED when the setup key is "" (the
    # credential-less validate default) — an env-less apply would strip NetBird
    # from the live CP configs, cutting the operators' kube-cp route. Fail loudly.
    precondition {
      condition     = length(var.netbird_talos_cp_setup_key) > 0
      error_message = "netbird_talos_cp_setup_key is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}
