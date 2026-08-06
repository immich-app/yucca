# Nodes are dialed at their maintenance IP, which is also pinned as the
# post-install static IP on the bond.

module "names" {
  source       = "../node-names"
  cluster_name = var.cluster_name
  name_seed    = var.name_seed
  names        = [for n in var.nodes : n.name]
}

locals {
  cluster_endpoint = coalesce(var.cluster_endpoint, "https://${var.cluster_vip}:6443")

  netmask = split("/", var.subnet_cidr)[1]

  nodes_named = [
    for i, n in var.nodes : merge(n, {
      role     = coalesce(n.role, "control-plane")
      hostname = "${var.product}-${var.provider_code}-${var.region_code}-${var.cluster_name}-${var.role_in_hostname}-${module.names.resolved[i]}"
    })
  ]

  # Keyed by address, NOT hostname — hostnames derive from random_shuffle and are
  # unknown at plan (for_each keys must be known at plan).
  node_map        = { for n in local.nodes_named : n.address => n }
  cp_node_map     = { for k, n in local.node_map : k => n if n.role == "control-plane" }
  worker_node_map = { for k, n in local.node_map : k => n if n.role == "worker" }

  cp_addresses = [for k, n in local.cp_node_map : n.address]

  # Bootstrap CP: lowest-keyed, deterministic. Bootstrap is one-shot — the pick
  # must NOT change post-bootstrap (re-running rolls cluster identity).
  bootstrap_cp = local.cp_node_map[sort(keys(local.cp_node_map))[0]]

  install_image = (
    var.talos_schematic_id != null
    ? "factory.talos.dev/metal-installer/${var.talos_schematic_id}:v${var.talos_version}"
    : "ghcr.io/siderolabs/installer:v${var.talos_version}"
  )
}

resource "talos_machine_secrets" "this" {
  talos_version = "v${var.talos_version}"
}

locals {
  install_patch = yamlencode({
    machine = {
      install = {
        disk  = var.install_disk
        image = local.install_image
      }
    }
  })

  # Only takes effect once the node runs a schematic including siderolabs/netbird
  # (talos_schematic_id + `talosctl upgrade` to that image). NB_MANAGEMENT_URL is
  # the Cloud default, set explicitly to mirror the ansible mgmt role.
  netbird_patches = var.netbird_setup_key != "" ? [
    yamlencode({
      apiVersion = "v1alpha1"
      kind       = "ExtensionServiceConfig"
      name       = "netbird"
      environment = [
        "NB_SETUP_KEY=${var.netbird_setup_key}",
        "NB_MANAGEMENT_URL=https://api.netbird.io",
      ]
    })
  ] : []

  shared_patches = concat([local.install_patch], local.netbird_patches, var.config_patches)

  # SANs include direct CP IPs — the VIP follows the leader and isn't always reachable.
  cp_cluster_config = merge(
    {
      allowSchedulingOnControlPlanes = var.allow_scheduling_on_control_planes
      apiServer = {
        certSANs = concat([var.cluster_vip], local.cp_addresses)
      }
    },
    # cilium is installed out-of-band → Talos CNI none.
    contains(["cilium", "none"], var.cni) ? { network = { cni = { name = "none" } } } : {},
    var.disable_kube_proxy ? { proxy = { disabled = true } } : {},
  )

  cp_patches = concat(
    local.shared_patches,
    [yamlencode({ cluster = local.cp_cluster_config })],
    local.common_firewall_patches,
    local.cp_firewall_patches,
  )

  worker_patches = concat(local.shared_patches, local.common_firewall_patches)

  per_node_patches = {
    for k, n in local.node_map : k => [
      yamlencode({
        machine = {
          network = {
            nameservers = var.nameservers
            interfaces = [
              merge(
                {
                  interface = var.bond.name
                  dhcp      = false
                  addresses = ["${n.address}/${local.netmask}"]
                  routes = [
                    {
                      network = "0.0.0.0/0"
                      gateway = var.gateway
                    },
                  ]
                  bond = merge(
                    {
                      interfaces = var.bond.interfaces
                      mode       = var.bond.mode
                      miimon     = var.bond.miimon
                    },
                    var.bond.mode == "802.3ad" ? {
                      lacpRate       = var.bond.lacp_rate
                      xmitHashPolicy = var.bond.xmit_hash_policy
                    } : {}
                  )
                },
                coalesce(n.role, "control-plane") == "control-plane" ? { vip = { ip = var.cluster_vip } } : {}
              ),
            ]
          }
        }
      }),
      # HostnameConfig multi-doc, NOT machine.network.hostname — Talos v1.13
      # rejects the v1alpha1 hostname as "already set" when otherwise determined.
      # "off" must stay quoted (YAML 1.1 parses bare off as false).
      yamlencode({
        apiVersion = "v1alpha1"
        kind       = "HostnameConfig"
        auto       = "off"
        hostname   = n.hostname
      }),
    ]
  }
}

data "talos_machine_configuration" "controlplane" {
  cluster_name       = var.cluster_name
  machine_type       = "controlplane"
  cluster_endpoint   = local.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${var.talos_version}"
  kubernetes_version = var.kubernetes_version
  config_patches     = local.cp_patches
}

data "talos_machine_configuration" "worker" {
  cluster_name       = var.cluster_name
  machine_type       = "worker"
  cluster_endpoint   = local.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${var.talos_version}"
  kubernetes_version = var.kubernetes_version
  config_patches     = local.worker_patches
}

resource "talos_machine_configuration_apply" "controlplane" {
  for_each = local.cp_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.controlplane.machine_configuration
  node                        = each.value.address
  endpoint                    = each.value.address
  config_patches              = local.per_node_patches[each.key]
  apply_mode                  = "auto"

  on_destroy = {
    reboot   = true
    reset    = true
    graceful = false
  }
}

# One-shot bootstrap (re-running rolls cluster identity), gated on the full CP
# apply set (siderolabs/terraform-provider-talos#265 — TF may otherwise schedule
# bootstrap before every CP is configured).
resource "talos_machine_bootstrap" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_cp.address
  endpoint             = local.bootstrap_cp.address

  # Cold image pulls + etcd election can take minutes; provider does not retry.
  timeouts = {
    create = "10m"
  }

  depends_on = [talos_machine_configuration_apply.controlplane]
}

resource "talos_machine_configuration_apply" "worker" {
  for_each = local.worker_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.worker.machine_configuration
  node                        = each.value.address
  endpoint                    = each.value.address
  config_patches              = local.per_node_patches[each.key]
  apply_mode                  = "auto"

  on_destroy = {
    reboot   = true
    reset    = true
    graceful = false
  }

  depends_on = [talos_machine_bootstrap.this]
}

# Dialed direct — the VIP may not be up until election settles.
resource "talos_cluster_kubeconfig" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_cp.address
  endpoint             = local.bootstrap_cp.address

  depends_on = [talos_machine_bootstrap.this]
}

# Direct CP IPs, NOT the VIP — unreachable exactly during failures.
data "talos_client_configuration" "this" {
  cluster_name         = var.cluster_name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = local.cp_addresses
  nodes                = [for k, n in local.node_map : n.address]
}

# Reaches nodes directly: apply must run from a host that routes the node subnet.
data "talos_cluster_health" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  control_plane_nodes  = [for k, n in local.cp_node_map : n.address]
  worker_nodes         = [for k, n in local.worker_node_map : n.address]
  endpoints            = local.cp_addresses

  # With out-of-band CNI, nodes stay NotReady until it lands — check Talos/etcd only.
  skip_kubernetes_checks = var.health_skip_kubernetes_checks

  timeouts = {
    read = "10m"
  }

  depends_on = [
    talos_machine_bootstrap.this,
    talos_machine_configuration_apply.worker,
  ]
}
