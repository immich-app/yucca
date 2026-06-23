# talos-baremetal — brings up a Talos cluster on bare-metal nodes that are
# already running Talos in maintenance mode at known addresses. Drives the
# whole sequence via the siderolabs/talos provider:
#
#   machine_secrets → per-role machine_configuration → CP config apply
#   (install to disk + reboot) → machine_bootstrap (one CP) → worker apply
#   → kubeconfig + talosconfig → cluster_health gate.
#
# Differs from the talos-cluster module (which provisions VMs on ceph
# hypervisors over VLAN 50): no Ansible inventory, no hypervisors, no
# kernel `ip=` cmdline. Nodes are dialed directly at their maintenance IP,
# which is also pinned as the post-install static IP on the bond.

locals {
  cluster_endpoint = coalesce(var.cluster_endpoint, "https://${var.cluster_vip}:6443")

  # Prefix length from the subnet CIDR (e.g. "24" from "10.10.10.0/24").
  netmask = split("/", var.subnet_cidr)[1]

  # Stable per-name maps (TF map iteration is alphabetical by key, so plan
  # ordering is deterministic across runs).
  node_map        = { for n in var.nodes : n.name => n }
  cp_node_map     = { for k, n in local.node_map : k => n if coalesce(n.role, "control-plane") == "control-plane" }
  worker_node_map = { for k, n in local.node_map : k => n if coalesce(n.role, "control-plane") == "worker" }

  cp_addresses = [for k, n in local.cp_node_map : n.address]

  # Bootstrap CP: lowest-named control-plane, deterministic. Bootstrap is
  # one-shot — re-running rolls cluster identity, so this pick must NOT
  # change post-bootstrap.
  bootstrap_cp = local.cp_node_map[sort(keys(local.cp_node_map))[0]]

  # Factory metal installer keeps a schematic's extensions; stock installer
  # otherwise. Pinned to v${talos_version} so the installed system is exactly
  # that version regardless of which image the node booted into maintenance on.
  install_image = (
    var.talos_schematic_id != null
    ? "factory.talos.dev/metal-installer/${var.talos_schematic_id}:v${var.talos_version}"
    : "ghcr.io/siderolabs/installer:v${var.talos_version}"
  )
}

# One machine_secrets per cluster (Talos PKI; sensitive).
resource "talos_machine_secrets" "this" {
  talos_version = "v${var.talos_version}"
}

# ─── Shared + per-role config patches ───────────────────────────────────

locals {
  # Applied to every node: install target + image.
  install_patch = yamlencode({
    machine = {
      install = {
        disk  = var.install_disk
        image = local.install_image
      }
    }
  })

  shared_patches = concat([local.install_patch], var.config_patches)

  # Control-plane cluster-level config: compact-cluster scheduling toggle +
  # apiserver cert SANs (VIP for in-cluster traffic, direct CP IPs for
  # operators — the floating VIP follows the leader and isn't always the
  # node you can reach). Firewall: common rules + CP-only services (firewall
  # locals live in firewall.tf).
  cp_cluster_config = merge(
    {
      allowSchedulingOnControlPlanes = var.allow_scheduling_on_control_planes
      apiServer = {
        certSANs = concat([var.cluster_vip], local.cp_addresses)
      }
    },
    # Disable the bundled CNI for Cilium/none — it's installed out-of-band.
    contains(["cilium", "none"], var.cni) ? { network = { cni = { name = "none" } } } : {},
    # kube-proxy replacement: Cilium uses Talos KubePrism (localhost:7445).
    var.disable_kube_proxy ? { proxy = { disabled = true } } : {},
  )

  cp_patches = concat(
    local.shared_patches,
    [yamlencode({ cluster = local.cp_cluster_config })],
    local.common_firewall_patches,
    local.cp_firewall_patches,
  )

  worker_patches = concat(local.shared_patches, local.common_firewall_patches)

  # Per-node network: bond0 over the physical NICs, static address, default
  # route, hostname, resolvers. CPs additionally carry the shared VIP on the
  # bond (Talos elects a single holder via etcd).
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
                  # LACP-only fields (lacpRate/xmitHashPolicy) are emitted only
                  # for 802.3ad — they're meaningless for active-backup, so the
                  # active-backup bring-up stays clean and the later flip to
                  # 802.3ad adds them automatically.
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
      # Hostname via the HostnameConfig multi-doc (auto:"off"), NOT
      # machine.network.hostname — Talos v1.13 rejects the v1alpha1 hostname
      # as "already set" when a hostname is otherwise determined. "off" must
      # stay quoted (YAML 1.1 parses bare off as boolean false).
      yamlencode({
        apiVersion = "v1alpha1"
        kind       = "HostnameConfig"
        auto       = "off"
        hostname   = n.name
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

# ─── Per-node config apply (installs to disk + reboots) ─────────────────

# CP-first, then bootstrap, then workers — workers must not race the
# apiserver coming up (they'd sit in maintenance until it's reachable).
resource "talos_machine_configuration_apply" "controlplane" {
  for_each = local.cp_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.controlplane.machine_configuration
  node                        = each.value.address
  endpoint                    = each.value.address
  config_patches              = local.per_node_patches[each.key]
  apply_mode                  = "auto"

  # Reset + reboot on destroy so `tf:destroy` wipes the node back toward
  # maintenance mode rather than leaving a half-configured install.
  on_destroy = {
    reboot   = true
    reset    = true
    graceful = false
  }
}

# ONE bootstrap call against the explicit bootstrap CP, gated on the full CP
# apply set (siderolabs/terraform-provider-talos#265 — otherwise TF may
# schedule bootstrap before every CP is configured). One-shot: re-running
# rolls cluster identity.
resource "talos_machine_bootstrap" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_cp.address
  endpoint             = local.bootstrap_cp.address

  # Cold nodes pulling images + initial etcd leader election can take a few
  # minutes; 10m absorbs that without masking a real stall (provider does
  # not retry).
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

# Kubeconfig — server URL = cluster_endpoint (the VIP). Dialed via the
# bootstrap CP's direct IP (the VIP may not be up until election settles).
resource "talos_cluster_kubeconfig" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_cp.address
  endpoint             = local.bootstrap_cp.address

  depends_on = [talos_machine_bootstrap.this]
}

# Talosconfig endpoints = direct CP IPs (NOT the VIP): the VIP follows the
# leader, which is exactly the node you can't reach during a failure.
data "talos_client_configuration" "this" {
  cluster_name         = var.cluster_name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = local.cp_addresses
  nodes                = [for k, n in local.node_map : n.address]
}

# Health gate — blocks apply until etcd quorum + all nodes Ready, turning a
# silently-broken bring-up into a hard failure. Reaches nodes directly, so
# apply must run from a host that routes the node subnet.
data "talos_cluster_health" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  control_plane_nodes  = [for k, n in local.cp_node_map : n.address]
  worker_nodes         = [for k, n in local.worker_node_map : n.address]
  endpoints            = local.cp_addresses

  # When the CNI is installed after bootstrap (cni=cilium), nodes stay
  # NotReady until then — verify only Talos/etcd health here, not k8s Ready.
  skip_kubernetes_checks = var.health_skip_kubernetes_checks

  timeouts = {
    read = "10m"
  }

  depends_on = [
    talos_machine_bootstrap.this,
    talos_machine_configuration_apply.worker,
  ]
}
