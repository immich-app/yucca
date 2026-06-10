# talos-bootstrap submodule — drives cluster identity via the siderolabs/talos
# provider: machine_secrets → per-role machine_configuration → CP apply →
# machine_bootstrap (one CP) → worker apply → kubeconfig → client_configuration
# (talosconfig) → cluster_health gate.
#
# Network config uses inline machine.network.* in the v1alpha1 doc. talosconfig
# endpoints are the direct CP IPs (NOT the VIP) so the Talos API stays reachable
# when the VIP's current leader is the node that's down.

locals {
  # Filter nodes by active profile.
  filtered_nodes = [
    for n in var.nodes :
    n if contains(coalesce(n.profiles, ["full", "smoke"]), var.profile)
  ]

  cp_nodes     = [for n in local.filtered_nodes : n if n.role == "control-plane"]
  worker_nodes = [for n in local.filtered_nodes : n if n.role == "worker"]

  # Explicit bootstrap CP pick: cp1 by convention. Failing that, first CP
  # in the filtered list (deterministic ordering since nodes is a list,
  # not a map). Bumping this value would re-roll cluster identity — do
  # NOT change post-bootstrap.
  bootstrap_cp = (
    length([for n in local.cp_nodes : n if n.name == "cp1"]) > 0
    ? [for n in local.cp_nodes : n if n.name == "cp1"][0]
    : local.cp_nodes[0]
  )
}

# ─── Cluster identity + per-role machine configuration templates ────────

# One machine_secrets per cluster (Talos PKI; sensitive). `talos_version`
# is updated in place — patch bumps are safe; major/minor may need migration.
resource "talos_machine_secrets" "this" {
  talos_version = "v${var.talos_version}"
}

locals {
  # VLAN 50 default gateway — first usable address in the subnet
  # (cidrhost with index 1; for 10.50.0.0/16 → 10.50.0.1). Override
  # via config_patches if the operator's actual gateway differs.
  vlan50_gateway = cidrhost(var.vlans.compute.subnet, 1)

  # CIDR mask for the compute subnet (e.g. "16" from "10.50.0.0/16").
  vlan50_mask = split("/", var.vlans.compute.subnet)[1]

  # Factory installer image so disk installs keep the schematic's extensions
  # (a stock installer would drop them). null schematic → bundled installer.
  install_image = (
    var.talos_schematic_id != null
    ? "factory.talos.dev/installer/${var.talos_schematic_id}:v${var.talos_version}"
    : null
  )

  # Cluster-wide patches: install disk (+ installer image) + DNS resolvers.
  # Per-node network config is in per_node_patches below.
  shared_patches = concat([
    yamlencode({
      machine = {
        install = merge(
          { disk = var.install_disk },
          local.install_image != null ? { image = local.install_image } : {}
        )
        network = {
          nameservers = ["1.1.1.1", "8.8.8.8"]
        }
      }
    }),
  ], var.config_patches)

  # CP-only cluster-level toggle: dedicated CPs (no scheduling).
  # o11y sets allowSchedulingOnControlPlanes=true because each o11y
  # cluster is single-node; our multi-node setup wants dedicated CPs.
  cp_patches = concat(local.shared_patches, [
    yamlencode({
      cluster = {
        allowSchedulingOnControlPlanes = false
      }
    })
  ])

  # Workers have no role-level extras at the type-template layer; the
  # VLAN-51 secondary NIC lives in per_node_patches because it's
  # role-conditional (worker only).
  worker_patches = local.shared_patches
}

data "talos_machine_configuration" "controlplane" {
  cluster_name       = var.cluster_name
  machine_type       = "controlplane"
  cluster_endpoint   = var.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${var.talos_version}"
  kubernetes_version = var.kubernetes_version
  config_patches     = local.cp_patches
  # talos_version pins the config SCHEMA to the running nodes. Keep aligned
  # with var.talos_version: a mismatched provider SDK emits keys the nodes
  # reject with "unknown keys found during decoding".
}

data "talos_machine_configuration" "worker" {
  cluster_name       = var.cluster_name
  machine_type       = "worker"
  cluster_endpoint   = var.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${var.talos_version}"
  kubernetes_version = var.kubernetes_version
  config_patches     = local.worker_patches
}

# ─── Per-VM machine_configuration_apply ─────────────────────────────────

locals {
  # Every filtered node needs a static_ip — it's the address apply dials.
  nodes_missing_ip = [for n in local.filtered_nodes : n.name if n.static_ip == null]

  # Build a map keyed by node name for stable for_each. Map iteration in
  # TF is alphabetical by key, so plan ordering is deterministic across runs.
  node_map = { for n in local.filtered_nodes : n.name => n }

  # Per-node patches. enp1s0 addr/gw/hostname come from the kernel `ip=`
  # cmdline; Talos v1.13 rejects a duplicate hostname here, so hostname is
  # cmdline-only. The static address IS re-declared (matches cmdline, dedupes)
  # so adding the CP VIP doesn't flush the interface (siderolabs/talos#11887).
  # Workers keep DHCP on the VLAN-51 services NIC.
  per_node_patches = {
    for k, n in local.node_map : k => [
      yamlencode({
        machine = {
          network = {
            interfaces = concat(
              [
                # enp1s0 (VLAN 50): static address + route; CPs add the VIP.
                merge(
                  {
                    interface = "enp1s0"
                    dhcp      = false
                    addresses = ["${n.static_ip}/${local.vlan50_mask}"]
                    routes = [
                      {
                        network = "0.0.0.0/0"
                        gateway = local.vlan50_gateway
                      },
                    ]
                  },
                  n.role == "control-plane" ? { vip = { ip = var.cp_vip } } : {}
                ),
              ],
              # enp2s0 (VLAN 51, workers): DHCP, routeMetric 200 so the
              # VLAN-50 default route stays primary.
              n.role == "worker" ? [
                {
                  interface = "enp2s0"
                  dhcp      = true
                  dhcpOptions = {
                    routeMetric = 200
                  }
                },
              ] : []
            )
          }
        }
      })
    ]
  }
}

# Hard-fail at plan time if any filtered node lacks a static_ip.
resource "terraform_data" "static_ip_required" {
  lifecycle {
    precondition {
      condition     = length(local.nodes_missing_ip) == 0
      error_message = "Talos nodes missing required static_ip: ${join(", ", local.nodes_missing_ip)}. talos-bootstrap can't apply machine config without a known address. Populate clusters.auto.tfvars nodes[].static_ip (must be outside the DHCP range)."
    }
  }
}

# Two-phase apply per SME guidance (CP-first, then bootstrap, then workers).
# Single-phase apply works but workers race on join — they'd sit in
# maintenance mode until apiserver is up. The two-phase split makes the
# dependency explicit and avoids the race.
locals {
  cp_node_map     = { for k, n in local.node_map : k => n if n.role == "control-plane" }
  worker_node_map = { for k, n in local.node_map : k => n if n.role == "worker" }
}

resource "talos_machine_configuration_apply" "controlplane" {
  for_each = local.cp_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.controlplane.machine_configuration
  node                        = each.value.static_ip
  endpoint                    = each.value.static_ip
  config_patches              = local.per_node_patches[each.key]
  apply_mode                  = "auto"

  depends_on = [terraform_data.static_ip_required]
}

# ─── Bootstrap + kubeconfig + talosconfig ───────────────────────────────

# ONE bootstrap call, against the explicit bootstrap CP (cp1 by
# convention; see local.bootstrap_cp). depends_on the FULL controlplane
# apply set per siderolabs/terraform-provider-talos issue #265 — without
# this, TF can schedule bootstrap before all CPs have been configured.
# bootstrap is one-shot; re-running rolls cluster identity (do NOT change
# bootstrap_cp post-bootstrap).
resource "talos_machine_bootstrap" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_cp.static_ip
  endpoint             = local.bootstrap_cp.static_ip

  # Bootstrap typically completes in 1-2 min on warm nodes, but cold
  # nodes pulling images + initial etcd leader election can take 2-4 min.
  # Pin 10m to absorb cold starts without hanging on a real stall.
  # Provider does NOT retry — surfacing the deadline cleanly is better
  # than masking a stall.
  timeouts = {
    create = "10m"
  }

  depends_on = [talos_machine_configuration_apply.controlplane]
}

resource "talos_machine_configuration_apply" "worker" {
  for_each = local.worker_node_map

  client_configuration        = talos_machine_secrets.this.client_configuration
  machine_configuration_input = data.talos_machine_configuration.worker.machine_configuration
  node                        = each.value.static_ip
  endpoint                    = each.value.static_ip
  config_patches              = local.per_node_patches[each.key]
  apply_mode                  = "auto"

  # Workers join AFTER bootstrap — apiserver must be reachable before
  # their kubelet attempts to register.
  depends_on = [talos_machine_bootstrap.this]
}

# Kubeconfig — uses the VIP endpoint (kube-apiserver binds there).
# Output as sensitive; persist via TF state (or downstream consumer
# extracts and stores in 1P / writes to disk).
resource "talos_cluster_kubeconfig" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_cp.static_ip
  endpoint             = local.bootstrap_cp.static_ip

  depends_on = [talos_machine_bootstrap.this]
}

# Talosconfig endpoints = direct CP IPs (NOT the VIP): the VIP follows the
# leader, which is exactly the node you can't reach during a failure.
# kubeconfig keeps the VIP; talosconfig uses direct IPs.
data "talos_client_configuration" "this" {
  cluster_name         = var.cluster_name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = [for k, n in local.cp_node_map : n.static_ip]
  nodes                = [for k, n in local.node_map : n.static_ip]
}

# Health gate — blocks `apply` until the cluster is genuinely healthy (etcd
# quorum + all nodes Ready), turning a silently-broken bring-up (e.g. fresh
# disks not re-bootstrapped) into a hard apply failure rather than a false
# success. Cheap re-read on a healthy cluster; reaches nodes over VLAN 50, so
# apply must run from a host that routes VLAN 50.
data "talos_cluster_health" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  control_plane_nodes  = [for k, n in local.cp_node_map : n.static_ip]
  worker_nodes         = [for k, n in local.worker_node_map : n.static_ip]
  endpoints            = [for k, n in local.cp_node_map : n.static_ip]

  timeouts = {
    read = "10m"
  }

  depends_on = [
    talos_machine_bootstrap.this,
    talos_machine_configuration_apply.worker,
  ]
}
