# Planes: etcd + apiserver + VIP → kube-cp VLAN 11 (10.40.11.0/24);
# pod east-west → kube VLAN 10 (50G, Cilium BGP); CP↔worker routed via the
# spine IRBs; NetBird is a backup plane only (fabric routes pinned in configs).

# Node names are EXPLICIT in tfvars — auto-picked names re-roll on pool changes,
# silently renaming (= replacing) live nodes.

locals {
  c = var.cluster
  # Clear of node planes (kube 10.40.10/24, kube-cp 10.40.11/24, NetBird
  # 10.254/15). Fixed at bootstrap — changing requires re-bootstrap.
  pod_cidr     = "10.250.0.0/17"   # 10.250.0.0 – 10.250.127.255
  service_cidr = "10.250.128.0/17" # 10.250.128.0 – 10.250.255.255

  # Bonds/VLANs + Cilium datapath. Switch L2 9216, IRBs 9202; Cilium MTU
  # auto-detect off (once clamped to wt0's 1280).
  fabric_mtu = 9000

  install_image = "factory.talos.dev/metal-installer/${local.talos_schematic_id}:v${local.c.talos_version}"

  # DNS name → Talos-elected VIP (same IP as the retired hcloud LB, so the
  # record carried over); mesh peers resolve it via the yucca.futo.network zone
  # (netbird stack). Kubelets dial KubePrism 127.0.0.1:7445 instead.
  api_dns_name     = "kube.${local.c.name}.${var.region_code}.${var.provider_code}.yucca.futo.network"
  cluster_endpoint = "https://${local.api_dns_name}:6443"

  api_vip        = cidrhost(local.kube_cp_cidr, local.c.vip_offset) # 10.40.11.5
  kube_cp_prefix = split("/", local.kube_cp_cidr)[1]                # 24

  # Hostname-keyed maps = stable apply key; list edits can't shift node identity.
  node_prefix     = "yucca-${var.provider_code}-${var.region_code}-${local.c.name}-k8s"
  cps_named       = [for n in local.c.cps : merge(n, { hostname = "${local.node_prefix}-${n.name}" })]
  cp_node_map     = { for n in local.cps_named : n.hostname => n }
  cp_ips          = local.cps_named[*].cp_ip
  workers_named   = [for w in local.c.workers : merge(w, { hostname = "${local.node_prefix}-${w.name}" })]
  worker_node_map = { for w in local.workers_named : w.hostname => w }

  apiserver_cert_sans = concat(
    [local.api_dns_name, local.api_vip],
    local.cp_ips,
    ["127.0.0.1", "localhost"],
  )

  # Talos default forwards coredns upstreams to host DNS on 169.254.116.108 —
  # unreachable from pods under Cilium bpf.masquerade (external lookups time out).
  # Off → coredns gets the node's real upstreams.
  hostdns_patch = yamlencode({
    machine = { features = { hostDNS = { forwardKubeDNSToHost = false } } }
  })

  # Distinct setup keys: CPs → [talos, talos_cp], workers → [talos]. talos_cp is
  # the CP-only kube-cp router group — a worker in it is treated as a router and
  # never installs the client route. Wiring: netbird stack.
  netbird_env = ["NB_MANAGEMENT_URL=https://api.netbird.io"]
  cp_netbird_patch = var.netbird_talos_cp_setup_key != "" ? yamlencode({
    apiVersion  = "v1alpha1"
    kind        = "ExtensionServiceConfig"
    name        = "netbird"
    environment = concat(["NB_SETUP_KEY=${var.netbird_talos_cp_setup_key}"], local.netbird_env)
  }) : ""
  worker_netbird_patch = var.netbird_talos_setup_key != "" ? yamlencode({
    apiVersion  = "v1alpha1"
    kind        = "ExtensionServiceConfig"
    name        = "netbird"
    environment = concat(["NB_SETUP_KEY=${var.netbird_talos_setup_key}"], local.netbird_env)
  }) : ""

  # clusterDNS must be explicit: Talos defaults 10.96.0.10 and does NOT derive
  # it from serviceSubnets.
  kubelet_cluster_dns = [cidrhost(local.service_cidr, 10)]
  cp_nodeip_patch     = yamlencode({ machine = { kubelet = { clusterDNS = local.kubelet_cluster_dns, nodeIP = { validSubnets = [local.kube_cp_cidr] } } } })
  # kubelet only sees an allow-listed /var set; /var/mnt hostPath is used by the
  # netops VictoriaMetrics 30d buffer (kubernetes/apps/prod/htz-fsn1/netops/).
  worker_nodeip_patch = yamlencode({ machine = { kubelet = {
    clusterDNS = local.kubelet_cluster_dns
    nodeIP     = { validSubnets = [local.kube_cidr] }
    # rbind NOT bind: the u-localpv partition mounts under /var/mnt after kubelet
    # starts — plain bind hides it and pods silently write to the system disk.
    extraMounts = [{
      destination = "/var/mnt"
      type        = "bind"
      source      = "/var/mnt"
      options     = ["rbind", "rshared", "rw"]
    }]
  } } })

  # nvme1n1 (non-install NVMe, 1.92TB) split 50/50: localpv → OpenEBS LocalPV
  # (CNPG node-local PG; replication is Postgres-level, deliberately not block);
  # mayastor → Mayastor DiskPool (repl=2; VictoriaMetrics). System disk is
  # nvme0n1, so !system_disk && nvme selects nvme1n1.
  worker_volumes_patch = join("\n---\n", [
    yamlencode({
      apiVersion = "v1alpha1"
      kind       = "UserVolumeConfig"
      name       = "localpv"
      provisioning = {
        diskSelector = { match = "!system_disk && disk.transport == 'nvme'" }
        minSize      = "890GiB"
        maxSize      = "890GiB"
      }
      filesystem = { type = "xfs" }
    }),
    yamlencode({
      apiVersion = "v1alpha1"
      kind       = "RawVolumeConfig"
      name       = "mayastor"
      provisioning = {
        diskSelector = { match = "!system_disk && disk.transport == 'nvme'" }
        minSize      = "890GiB"
        maxSize      = "890GiB"
      }
    }),
  ])

  # 1024 × 2MiB hugepages = 2GiB (SPDK); nvme_tcp for NVMe-oF attach. Kubelet
  # only discovers hugepages at startup — restart it once.
  worker_mayastor_patch = yamlencode({
    machine = {
      sysctls    = { "vm.nr_hugepages" = "1024" }
      kernel     = { modules = [{ name = "nvme_tcp" }] }
      nodeLabels = { "openebs.io/engine" = "mayastor" }
    }
  })

  cp_base_patches = compact([local.hostdns_patch, local.cp_netbird_patch, local.cp_nodeip_patch])
  worker_base_patches = compact([local.hostdns_patch, local.worker_mayastor_patch, local.worker_volumes_patch, local.worker_netbird_patch, local.worker_nodeip_patch])

  cp_cluster_patch = yamlencode({
    cluster = {
      allowSchedulingOnControlPlanes = false
      network = {
        cni            = { name = "none" } # Cilium, cilium.tf
        podSubnets     = [local.pod_cidr]
        serviceSubnets = [local.service_cidr]
      }
      proxy = { disabled = true } # Cilium KPR
      # coredns is ours (kubernetes/apps/prod/htz-fsn1/coredns.yaml): Talos kept
      # reverting its worker-affinity pin. Talos doesn't prune applied manifests —
      # disabling only stops it managing them.
      coreDNS = { disabled = true }
      apiServer = {
        certSANs = local.apiserver_cert_sans
        # hostNetwork pods copy /etc/hosts at sandbox creation — stamping the
        # entry-set hash forces a pod recreate when entries change.
        env = { HOSTS_REVISION = substr(sha256(jsonencode(local.cp_host_entries)), 0, 12) }
      }
      # Keeps CP↔CP etcd off the mesh + public NICs.
      etcd = { advertisedSubnets = [local.kube_cp_cidr] }
    }
  })

  # ip_forward: CPs are the NetBird route peers for kube-cp (yucca-fsn-father-kube-cp).
  # extraHostEntries: api_dns_name → CP IPs, NOT the VIP (a joining CP needs a
  # WORKING peer apiserver; the VIP may be parked on itself) nor 127.0.0.1. Node
  # hostnames → fabric IPs so apiserver→kubelet rides the fabric (Talos host-dns
  # can't resolve NetBird zones; hostNetwork apiserver inherits /etc/hosts).
  cp_host_entries = concat(
    [for ip in local.cp_ips : { ip = ip, aliases = [local.api_dns_name] }],
    # Iterate the tfvars lists, not the maps — entry order is part of the rendered
    # CP config; reordering churns every CP.
    [for n in local.cps_named : { ip = n.cp_ip, aliases = [n.hostname] }],
    [for w in local.workers_named : { ip = w.fabric_ip, aliases = [w.hostname] }],
  )

  cp_extras_patch = yamlencode({
    machine = {
      sysctls = { "net.ipv4.ip_forward" = "1" }
      network = { extraHostEntries = local.cp_host_entries }
    }
  })
}

resource "talos_machine_secrets" "this" {
  talos_version = "v${local.c.talos_version}"

  lifecycle {
    # Replacing rolls the ENTIRE cluster PKI; a deliberate re-key must lift this
    # flag in the same reviewed change.
    prevent_destroy = true
  }
}

data "talos_machine_configuration" "cp" {
  cluster_name       = local.c.name
  machine_type       = "controlplane"
  cluster_endpoint   = local.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${local.c.talos_version}"
  kubernetes_version = local.c.kubernetes_version
  config_patches = concat(
    local.cp_base_patches,
    [local.cp_cluster_patch, local.cp_extras_patch],
    local.common_firewall_patches,
    local.cp_firewall_patches,
  )
}

data "talos_machine_configuration" "worker" {
  cluster_name       = local.c.name
  machine_type       = "worker"
  cluster_endpoint   = local.cluster_endpoint
  machine_secrets    = talos_machine_secrets.this.machine_secrets
  talos_version      = "v${local.c.talos_version}"
  kubernetes_version = local.c.kubernetes_version
  config_patches     = concat(local.worker_base_patches, local.common_firewall_patches)
}

locals {
  # Provider dials ride the NetBird kube-cp route; greenfield, the route appears
  # once the first CP boots and joins the mesh.
  bootstrap_endpoint = local.cp_ips[0]
  operator_endpoint  = "https://${local.cp_ips[0]}:6443"
}

resource "talos_machine_bootstrap" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_endpoint
  endpoint             = local.bootstrap_endpoint
  timeouts             = { create = "10m" }

  depends_on = [talos_machine_configuration_apply.cp]

  lifecycle {
    # Replace re-bootstraps a LIVE cluster (identity roll); runbook (README) must
    # lift this flag. Also makes any bootstrap_endpoint change a hard plan error — intended.
    prevent_destroy = true
  }
}

resource "talos_cluster_kubeconfig" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_endpoint
  endpoint             = local.bootstrap_endpoint
  depends_on           = [talos_machine_bootstrap.this]
}

data "talos_client_configuration" "this" {
  cluster_name         = local.c.name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = local.cp_ips
  nodes                = concat(local.cp_ips, [for w in local.c.workers : w.fabric_ip])
}

locals {
  kube_client_config = talos_cluster_kubeconfig.this.kubernetes_client_configuration
}

# k8s-Ready is skipped — Cilium lands after (cilium.tf).
data "talos_cluster_health" "this" {
  count = var.bootstrap_health_gate ? 1 : 0

  client_configuration   = talos_machine_secrets.this.client_configuration
  control_plane_nodes    = local.cp_ips
  worker_nodes           = [for w in local.c.workers : w.fabric_ip]
  endpoints              = local.cp_ips
  skip_kubernetes_checks = true
  timeouts               = { read = "10m" }

  depends_on = [
    talos_machine_bootstrap.this,
    talos_machine_configuration_apply.worker,
  ]
}
