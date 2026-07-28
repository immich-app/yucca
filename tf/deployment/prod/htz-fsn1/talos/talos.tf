# ── Talos bring-up (all bare-metal) ──────────────────────────────────────────
# CPs and workers are both driven over apid (controlplane.tf / workers.tf) into
# ONE cluster (one set of machine_secrets). All node planes ride the fabric:
#
#   etcd (CP↔CP) + apiserver + API VIP → kube-cp fabric VLAN 11 (10.40.11.0/24)
#   worker↔worker pod east-west        → kube fabric VLAN 10 (50G), Cilium BGP
#   CP↔worker (apiserver↔kubelet, geneve) → routed kube↔kube-cp via the spine IRBs
#   operators/CI                        → NetBird mesh (kube-cp routed via the CPs)
#
# NetBird stays on every node as the operator/backup plane — node-to-node traffic
# no longer depends on it (static fabric routes are pinned in the machine configs).

# Node names are EXPLICIT in tfvars (cluster.cps[*].name + workers[*].name) —
# auto-picked names re-roll when the pool input changes, silently renaming (=
# replacing) live nodes.

locals {
  c = var.cluster
  # Cluster addressing — clear of the node planes (kube 10.40.10/24, kube-cp
  # 10.40.11/24, NetBird 10.254/15). Split of 10.250.0.0/16: pods low half, services
  # high half. Fixed at bootstrap — changing requires a re-bootstrap.
  pod_cidr     = "10.250.0.0/17"   # 10.250.0.0 – 10.250.127.255
  service_cidr = "10.250.128.0/17" # 10.250.128.0 – 10.250.255.255

  # Jumbo on the fabric bonds/VLANs (and Cilium's explicit datapath MTU). The
  # switch L2 is 9216 end to end and the IRBs 9202 (core-fabric); 9000 on the
  # hosts is the conventional value under both. Public NICs (Hetzner, DHCP) and
  # wt0 (WireGuard WAN) stay at their own MTUs — Cilium no longer auto-detects
  # (auto-detect once clamped the datapath to wt0's 1280).
  fabric_mtu = 9000

  # Factory installer (keeps the schematic's extensions) — one schematic for every
  # node (all metal now); consulted on install/upgrade.
  install_image = "factory.talos.dev/metal-installer/${local.talos_schematic_id}:v${local.c.talos_version}"

  # API endpoint: a NetBird DNS-zone name resolving to the Talos-elected VIP
  # (10.40.11.5, kube-cp VLAN — same IP the retired hcloud LB held, so the record
  # carried over). Name = kube.<cluster>.<region>.<provider>.yucca.futo.network.
  # It's in the cert SANs + on each node as a host-entry; NetBird peers resolve it
  # via the yucca.futo.network zone (netbird stack) and reach the VIP over the
  # kube-cp route (CPs are the route peers). Node-side traffic never resolves it:
  # kubelets dial KubePrism (127.0.0.1:7445), which load-balances to the CP IPs.
  api_dns_name     = "kube.${local.c.name}.${var.region_code}.${var.provider_code}.yucca.futo.network"
  cluster_endpoint = "https://${local.api_dns_name}:6443"

  api_vip        = cidrhost(local.kube_cp_cidr, local.c.vip_offset) # 10.40.11.5
  kube_cp_prefix = split("/", local.kube_cp_cidr)[1]                # 24

  # Hostnames: yucca-htz-fsn-father-k8s-<name>. Both roles get hostname-keyed
  # maps — the STABLE key for the apply resources, so list edits can't shift
  # another node's identity.
  node_prefix     = "yucca-${var.provider_code}-${var.region_code}-${local.c.name}-k8s"
  cps_named       = [for n in local.c.cps : merge(n, { hostname = "${local.node_prefix}-${n.name}" })]
  cp_node_map     = { for n in local.cps_named : n.hostname => n }
  cp_ips          = local.cps_named[*].cp_ip
  workers_named   = [for w in local.c.workers : merge(w, { hostname = "${local.node_prefix}-${w.name}" })]
  worker_node_map = { for w in local.workers_named : w.hostname => w }

  # apiserver cert SANs — the names/IPs clients dial.
  apiserver_cert_sans = concat(
    [local.api_dns_name, local.api_vip],
    local.cp_ips,
    ["127.0.0.1", "localhost"],
  )

  # Talos's default forwards coredns's upstream queries to the host DNS on a link-local
  # address (169.254.116.108) — unreachable from pods under Cilium's eBPF datapath
  # (bpf.masquerade), so every EXTERNAL lookup from a pod times out while cluster.local
  # works. Disabled → coredns's pod resolv.conf gets the node's real upstreams instead.
  hostdns_patch = yamlencode({
    machine = { features = { hostDNS = { forwardKubeDNSToHost = false } } }
  })

  # NetBird node-level overlay — the OPERATOR plane (kube-cp routed to the mesh via
  # the CPs) and a backup path; node-to-node traffic rides the fabric via the static
  # routes pinned below. CPs and workers join with DIFFERENT setup keys so they land
  # in different groups: CPs → [talos, talos_cp], workers → [talos]. talos_cp is the
  # CP-only router group for the kube-cp network — the workers must NOT be in it, or
  # NetBird treats them as kube-cp routers and they never install the client route.
  # See the netbird stack for the group/router wiring.
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

  # nodeIP selection:
  #   CPs     → kube-cp fabric VLAN 11 (etcd + apiserver↔CP-kubelet)
  #   workers → kube fabric VLAN 10 (all workers share the L2, so Cilium routes pod
  #             east-west directly over the 50G fabric)
  # clusterDNS must be set explicitly: Talos defaults it to 10.96.0.10 (the upstream
  # default service CIDR's DNS) and does NOT derive it from our serviceSubnets — the
  # kube-dns Service actually lands at cidrhost(service_cidr, 10). Without this every
  # pod's resolv.conf points at a black hole.
  kubelet_cluster_dns = [cidrhost(local.service_cidr, 10)]
  cp_nodeip_patch     = yamlencode({ machine = { kubelet = { clusterDNS = local.kubelet_cluster_dns, nodeIP = { validSubnets = [local.kube_cp_cidr] } } } })
  # extraMounts: expose /var/mnt to the kubelet so hostPath volumes there work —
  # Talos's kubelet container only sees an allow-listed /var set. Used by the netops
  # VictoriaMetrics 30d buffer (kubernetes/apps/prod/htz-fsn1/netops/).
  worker_nodeip_patch = yamlencode({ machine = { kubelet = {
    clusterDNS = local.kubelet_cluster_dns
    nodeIP     = { validSubnets = [local.kube_cidr] }
    # rbind (NOT bind): the u-localpv xfs partition mounts under /var/mnt AFTER
    # kubelet starts — a plain bind hides it and pods silently write to the
    # underlying system-disk directory instead of the data partition.
    extraMounts = [{
      destination = "/var/mnt"
      type        = "bind"
      source      = "/var/mnt"
      options     = ["rbind", "rshared", "rw"]
    }]
  } } })

  # nvme1n1 (the non-install NVMe, 1.92TB) split 50/50 per worker:
  #   u-localpv   890GiB xfs at /var/mnt/localpv — OpenEBS LocalPV (openebs-hostpath):
  #               CNPG's node-local PG volumes; replication is Postgres-level (CNPG),
  #               deliberately NOT block-level.
  #   r-mayastor  890GiB raw partition — the Mayastor DiskPool (openebs-replicated,
  #               repl=2 block replication) for everything that must survive a node
  #               loss (VictoriaMetrics today).
  # diskSelector: the system disk is nvme0n1, so !system_disk && nvme == nvme1n1.
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

  # OpenEBS Mayastor prereqs (workers): 2MiB hugepages for the io-engine's SPDK
  # data plane (1024 pages = 2GiB), the nvme-tcp initiator module (replicated
  # volumes attach over NVMe-oF), and the engine node label. The kubelet only
  # discovers the hugepages resource at startup — restart it once after this lands.
  worker_mayastor_patch = yamlencode({
    machine = {
      sysctls    = { "vm.nr_hugepages" = "1024" }
      kernel     = { modules = [{ name = "nvme_tcp" }] }
      nodeLabels = { "openebs.io/engine" = "mayastor" }
    }
  })

  cp_base_patches = compact([local.hostdns_patch, local.cp_netbird_patch, local.cp_nodeip_patch])
  # (install patch is PER-NODE — by disk serial — appended in controlplane.tf /
  # workers.tf, along with the bond/VLAN network patches.)
  worker_base_patches = compact([local.hostdns_patch, local.worker_mayastor_patch, local.worker_volumes_patch, local.worker_netbird_patch, local.worker_nodeip_patch])

  # ── Control-plane cluster config (same on every CP) ──────────────────────
  cp_cluster_patch = yamlencode({
    cluster = {
      allowSchedulingOnControlPlanes = false
      network = {
        cni            = { name = "none" } # Cilium installed out-of-band
        podSubnets     = [local.pod_cidr]
        serviceSubnets = [local.service_cidr]
      }
      proxy = { disabled = true } # Cilium kube-proxy replacement (KubePrism)
      # coredns is OURS (kubernetes/apps/prod/htz-fsn1/coredns.yaml), not Talos's:
      # Talos's bootstrap-manifest reconciliation kept reverting the worker-affinity
      # pin on every CP config change, putting coredns back on the CPs where worker
      # pods can't reliably reach it. Talos doesn't prune already-applied manifests,
      # so disabling only stops it from managing/reverting them.
      coreDNS = { disabled = true }
      apiServer = {
        certSANs = local.apiserver_cert_sans
        # hostNetwork pods get /etc/hosts COPIED at sandbox creation — a host-level
        # extraHostEntries refresh never reaches the RUNNING apiserver. Stamping the
        # entry-set hash into the pod spec forces kubelet to recreate the pod (fresh
        # /etc/hosts) whenever the entry set changes (e.g. a node add).
        env = { HOSTS_REVISION = substr(sha256(jsonencode(local.cp_host_entries)), 0, 12) }
      }
      # Pin etcd to the kube-cp VLAN so CP↔CP etcd stays off the mesh + public NICs.
      etcd = { advertisedSubnets = [local.kube_cp_cidr] }
    }
  })

  # CP node extras:
  #  • ip_forward — the CPs are the NetBird route peers for the kube-cp subnet
  #    (yucca-fsn-father-kube-cp), so they must forward overlay↔subnet traffic.
  #  • extraHostEntries — resolve api_dns_name to the 3 CP IPs (round-robin, all in
  #    the cert SANs). NOT the VIP (a joining CP must reach a WORKING apiserver — a
  #    peer's — to register its etcd membership; the VIP may be parked on itself),
  #    and NOT 127.0.0.1. Every node hostname also resolves to its fabric IP so
  #    apiserver→kubelet dials ride the fabric (Talos host-dns can't resolve NetBird
  #    DNS zones, hence /etc/hosts, which the hostNetwork apiserver inherits).
  #    Off-node peers resolve api_dns_name via the NetBird yucca.futo.network zone.
  cp_host_entries = concat(
    [for ip in local.cp_ips : { ip = ip, aliases = [local.api_dns_name] }],
    # Iterate the tfvars LISTS (not the hostname-keyed maps, whose lexical order
    # differs) — entry order is part of the rendered CP config, and reordering it
    # would churn every CP's machine config for nothing.
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

# Cluster PKI (sensitive).
resource "talos_machine_secrets" "this" {
  talos_version = "v${local.c.talos_version}"

  lifecycle {
    # Destroying/replacing this rolls the ENTIRE cluster identity (every node's
    # PKI). Any plan that wants to is a bug — a deliberate re-key must lift this
    # flag in the same reviewed change.
    prevent_destroy = true
  }
}

# CP base config — per-CP install/network/hostname patches are added at apply
# time (controlplane.tf).
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

# ── Bootstrap / kubeconfig / health ───────────────────────────────────────────
locals {
  # Everything the talos provider dials — bootstrap, kubeconfig, talosconfig,
  # health, and the helm/kubernetes providers — uses the kube-cp IPs, reachable
  # from the apply host over the NetBird kube-cp route (and in the cert SANs).
  # During a greenfield bring-up the route appears as soon as the first CP boots
  # into the cluster and joins the mesh (the CPs are the route peers).
  bootstrap_endpoint = local.cp_ips[0]
  operator_endpoint  = "https://${local.cp_ips[0]}:6443"
}

# One-shot bootstrap against the first CP. Re-running rolls cluster identity.
resource "talos_machine_bootstrap" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_endpoint
  endpoint             = local.bootstrap_endpoint
  timeouts             = { create = "10m" }

  depends_on = [talos_machine_configuration_apply.cp]

  lifecycle {
    # A replace re-bootstraps a LIVE cluster (identity roll). The re-bootstrap
    # runbook (README) must lift this flag deliberately. Note this also turns
    # any bootstrap_endpoint change into a hard plan error — intended.
    prevent_destroy = true
  }
}

resource "talos_cluster_kubeconfig" "this" {
  client_configuration = talos_machine_secrets.this.client_configuration
  node                 = local.bootstrap_endpoint
  endpoint             = local.bootstrap_endpoint
  depends_on           = [talos_machine_bootstrap.this]
}

# talosconfig endpoints = CP kube-cp IPs (reached over NetBird; no public).
data "talos_client_configuration" "this" {
  cluster_name         = local.c.name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = local.cp_ips
  nodes                = concat(local.cp_ips, [for w in local.c.workers : w.fabric_ip])
}

locals {
  kube_client_config = talos_cluster_kubeconfig.this.kubernetes_client_configuration
}

# Talos/etcd health after workers are applied; k8s-Ready is skipped (Cilium lands
# after, in cilium.tf).
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
