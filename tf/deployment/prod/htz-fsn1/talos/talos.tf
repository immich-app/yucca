# ── Talos bring-up (hybrid) ──────────────────────────────────────────────────
# Cloud CPs are configured via hcloud user_data (controlplane.tf); bare-metal
# workers via apid apply (workers.tf). Both join the SAME cluster (one set of
# machine_secrets) and the SAME NetBird mesh (node IPs are NetBird addresses).
#
#   node plane (CP↔worker, etcd-client, apiserver↔kubelet) → NetBird (100.64/10)
#   etcd (CP↔CP)                                            → kube-cp hcloud subnet
#   worker↔worker pod east-west                            → kube fabric (50G), Cilium BGP
#   API endpoint                                            → public Hetzner Cloud LB
#
# Bootstrap/kubeconfig/health dial the CP PUBLIC IPs (firewalled) — the only thing
# the TF runner can reach before NetBird/the LB settle.

module "names" {
  source       = "../../../../shared/modules/node-names"
  cluster_name = var.cluster.name
  # CPs first (auto-picked), then workers (explicit override or auto).
  names = concat(
    [for i in range(var.cluster.cp_count) : null],
    [for w in var.cluster.workers : try(w.name, null)],
  )
}

locals {
  c            = var.cluster
  pod_cidr     = "10.244.0.0/16"
  service_cidr = "10.96.0.0/12"

  # Factory metal installer (keeps the schematic's extensions). Used by workers on
  # install; CPs boot the hcloud snapshot and only consult this on a reinstall.
  install_image = "factory.talos.dev/metal-installer/${local.talos_schematic_id}:v${local.c.talos_version}"

  # Private API endpoint: a NetBird DNS-zone name resolving to the PRIVATE LB IP
  # (10.40.11.5). Name = kube.<cluster>.<region>.<provider>.yucca.internal (e.g.
  # kube.father.fsn.htz.yucca.internal). It's in the cert SANs + on each CP as a
  # host-entry; NetBird peers resolve it via the yucca.internal zone (netbird stack)
  # and reach the LB over the kube-cp route (CPs are the route peers).
  api_dns_name     = "kube.${local.c.name}.${var.region_code}.${var.provider_code}.yucca.internal"
  cluster_endpoint = "https://${local.api_dns_name}:6443"

  kube_cp_prefix = split("/", local.kube_cp_cidr)[1] # 24

  # Hostnames: yucca-htz-fsn-father-k8s-<name>.
  hostname = { for i in range(local.c.cp_count + length(local.c.workers)) :
    i => "yucca-${var.provider_code}-${var.region_code}-${local.c.name}-k8s-${module.names.resolved[i]}"
  }
  cp_hostnames     = [for i in range(local.c.cp_count) : local.hostname[i]]
  worker_hostnames = [for j in range(length(local.c.workers)) : local.hostname[local.c.cp_count + j]]

  # apiserver cert SANs — the names/IPs clients dial. NOT the CP public IPs (those
  # don't exist until the servers are created from this very config).
  apiserver_cert_sans = concat(
    [local.api_dns_name, local.lb_private_ip],
    local.cp_private_ips,
    ["127.0.0.1", "localhost"],
  )

  # ── Shared patches (every node) ──────────────────────────────────────────
  install_patch = yamlencode({
    machine = { install = { disk = local.c.install_disk, image = local.install_image } }
  })

  # NetBird node-level overlay — applied to the CPs ONLY. It gives each CP a route
  # to the `kube` fabric net (10.40.10.0/24, advertised via the mgmt NetBird
  # routers) so apiserver→worker-kubelet works without a vSwitch. Workers are NOT
  # NetBird peers: they live on the fabric and reach the apiserver via the LB.
  netbird_patch = var.netbird_talos_setup_key != "" ? yamlencode({
    apiVersion = "v1alpha1"
    kind       = "ExtensionServiceConfig"
    name       = "netbird"
    environment = [
      "NB_SETUP_KEY=${var.netbird_talos_setup_key}",
      "NB_MANAGEMENT_URL=https://api.netbird.io",
    ]
  }) : ""

  # nodeIP selection:
  #   CPs    → kube-cp hcloud private subnet (apiserver↔CP-kubelet stays private;
  #            decoupled from NetBird readiness at boot)
  #   workers → kube fabric IP. All workers share VLAN-10 L2, so Cilium
  #            autoDirectNodeRoutes routes pod east-west directly over the 50G
  #            fabric — no BGP, no overlay.
  cp_nodeip_patch     = yamlencode({ machine = { kubelet = { nodeIP = { validSubnets = [local.kube_cp_cidr] } } } })
  worker_nodeip_patch = yamlencode({ machine = { kubelet = { nodeIP = { validSubnets = [local.kube_cidr] } } } })

  cp_base_patches     = compact([local.install_patch, local.netbird_patch, local.cp_nodeip_patch])
  worker_base_patches = compact([local.install_patch, local.worker_nodeip_patch])

  # ── Control-plane cluster config (same on every CP) ──────────────────────
  cp_cluster_patch = yamlencode({
    cluster = {
      allowSchedulingOnControlPlanes = false
      network = {
        cni            = { name = "none" } # Cilium installed out-of-band
        podSubnets     = [local.pod_cidr]
        serviceSubnets = [local.service_cidr]
      }
      proxy     = { disabled = true } # Cilium kube-proxy replacement (KubePrism)
      apiServer = { certSANs = local.apiserver_cert_sans }
      # Pin etcd to the kube-cp hcloud subnet so CP↔CP etcd stays off the mesh.
      etcd = { advertisedSubnets = [local.kube_cp_cidr] }
    }
  })

  # CP node extras:
  #  • ip_forward — the CPs are the NetBird route peers for the kube-cp subnet
  #    (yucca-fsn-father-kube-cp), so they must forward overlay↔subnet traffic.
  #  • extraHostEntries — resolve api_dns_name to the PRIVATE LB IP on the CPs (no
  #    public DNS). api_dns_name is in the cert SANs, so the control-plane endpoint
  #    stays fully private and the StaticEndpointController "no such host" churn stops.
  cp_extras_patch = yamlencode({
    machine = {
      sysctls = { "net.ipv4.ip_forward" = "1" }
      network = { extraHostEntries = [{ ip = local.lb_private_ip, aliases = [local.api_dns_name] }] }
    }
  })

  # ── Per-CP patches (hostname + hcloud private NIC for etcd) ───────────────
  # eth0 = hcloud public (DHCP, default route); eth1 = hcloud private (etcd),
  # static to the assigned IP at MTU 1450. VERIFY eth1 is the private NIC on the
  # snapshot (Talos may name it differently — use a deviceSelector if so).
  cp_node_patches = [for i in range(local.c.cp_count) : [
    yamlencode({
      machine = {
        network = {
          interfaces = [{
            interface = "eth1"
            dhcp      = false
            addresses = ["${local.cp_private_ips[i]}/${local.kube_cp_prefix}"]
            mtu       = 1450
          }]
        }
      }
    }),
    yamlencode({ apiVersion = "v1alpha1", kind = "HostnameConfig", auto = "off", hostname = local.cp_hostnames[i] }),
  ]]
}

# Cluster PKI (sensitive).
resource "talos_machine_secrets" "this" {
  talos_version = "v${local.c.talos_version}"
}

# Per-CP machine config — rendered into hcloud user_data (controlplane.tf). Each
# CP gets the shared + CP-cluster + its own per-node patches.
data "talos_machine_configuration" "cp" {
  count = local.c.cp_count

  cluster_name       = local.c.name
  machine_type       = "controlplane"
  cluster_endpoint   = local.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${local.c.talos_version}"
  kubernetes_version = local.c.kubernetes_version
  config_patches = concat(
    local.cp_base_patches,
    [local.cp_cluster_patch, local.cp_extras_patch],
    local.cp_node_patches[count.index],
    local.common_firewall_patches,
    local.cp_firewall_patches,
  )
}

# Worker base config — per-worker network/hostname patches are added at apply time
# (workers.tf).
data "talos_machine_configuration" "worker" {
  cluster_name       = local.c.name
  machine_type       = "worker"
  cluster_endpoint   = local.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${local.c.talos_version}"
  kubernetes_version = local.c.kubernetes_version
  config_patches     = concat(local.worker_base_patches, local.common_firewall_patches)
}

# ── Bootstrap / kubeconfig / health (dial CP public IPs) ──────────────────────
locals {
  cp_public_ips      = hcloud_server.control_plane[*].ipv4_address
  bootstrap_endpoint = local.cp_public_ips[0]
  operator_endpoint  = "https://${local.bootstrap_endpoint}:6443"
}

# One-shot bootstrap against the first CP. Re-running rolls cluster identity.
resource "talos_machine_bootstrap" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_endpoint
  endpoint             = local.bootstrap_endpoint
  timeouts             = { create = "10m" }

  depends_on = [hcloud_server.control_plane]
}

resource "talos_cluster_kubeconfig" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_endpoint
  endpoint             = local.bootstrap_endpoint
  depends_on           = [talos_machine_bootstrap.this]
}

# talosconfig endpoints = CP public IPs (recovery path; the LB/mesh may be down
# exactly when you need talosctl).
data "talos_client_configuration" "this" {
  cluster_name         = local.c.name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = local.cp_public_ips
  nodes                = concat(local.cp_public_ips, [for w in local.c.workers : w.fabric_ip])
}

locals {
  kube_client_config = talos_cluster_kubeconfig.this.kubernetes_client_configuration
}

# Talos/etcd health after workers are applied; k8s-Ready is skipped (Cilium lands
# after, in cilium.tf).
data "talos_cluster_health" "this" {
  client_configuration   = talos_machine_secrets.this.client_configuration
  control_plane_nodes    = local.cp_public_ips
  worker_nodes           = [for w in local.c.workers : w.fabric_ip]
  endpoints              = local.cp_public_ips
  skip_kubernetes_checks = true
  timeouts               = { read = "10m" }

  depends_on = [
    talos_machine_bootstrap.this,
    talos_machine_configuration_apply.worker,
  ]
}
