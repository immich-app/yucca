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
  c = var.cluster
  # Cluster addressing — clear of the node planes (kube 10.40.10/24, kube-cp
  # 10.40.11/24, NetBird 10.254/15). Split of 10.250.0.0/16: pods low half, services
  # high half. Fixed at bootstrap — changing requires a re-bootstrap.
  pod_cidr     = "10.250.0.0/17"   # 10.250.0.0 – 10.250.127.255
  service_cidr = "10.250.128.0/17" # 10.250.128.0 – 10.250.255.255

  # Factory installers (keep each schematic's extensions). Workers consult theirs on
  # install/upgrade; CPs boot the hcloud snapshot and only consult this on a reinstall.
  # SPLIT per role: the worker schematic drops qemu-guest-agent (blocks metal boot).
  cp_install_image     = "factory.talos.dev/metal-installer/${local.talos_schematic_id}:v${local.c.talos_version}"
  worker_install_image = "factory.talos.dev/metal-installer/${local.talos_worker_schematic_id}:v${local.c.talos_version}"

  # Private API endpoint: a NetBird DNS-zone name resolving to the PRIVATE LB IP
  # (10.40.11.5). Name = kube.<cluster>.<region>.<provider>.yucca.futo.network. It's
  # in the cert SANs + on each CP as a host-entry; NetBird peers resolve it via the
  # yucca.futo.network zone (netbird stack) and reach the LB over the kube-cp route
  # (CPs are the route peers). Node-side traffic never resolves it: kubelets dial
  # KubePrism (127.0.0.1:7445), which load-balances to the CP IPs directly.
  # legacy_api_dns_name (the old yucca.internal name) stays in the SANs + host
  # entries so pre-migration kubeconfigs keep verifying — drop it once rotated.
  api_dns_name        = "kube.${local.c.name}.${var.region_code}.${var.provider_code}.yucca.futo.network"
  legacy_api_dns_name = "kube.${local.c.name}.${var.region_code}.${var.provider_code}.yucca.internal"
  cluster_endpoint    = "https://${local.api_dns_name}:6443"

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
    [local.api_dns_name, local.legacy_api_dns_name, local.lb_private_ip],
    local.cp_private_ips,
    ["127.0.0.1", "localhost"],
  )

  # ── Shared patches (every node) ──────────────────────────────────────────
  cp_install_patch = yamlencode({
    machine = { install = { disk = local.c.install_disk, image = local.cp_install_image } }
  })


  # Talos's default forwards coredns's upstream queries to the host DNS on a link-local
  # address (169.254.116.108) — unreachable from pods under Cilium's eBPF datapath
  # (bpf.masquerade), so every EXTERNAL lookup from a pod times out while cluster.local
  # works. Disabled → coredns's pod resolv.conf gets the node's real upstreams instead.
  hostdns_patch = yamlencode({
    machine = { features = { hostDNS = { forwardKubeDNSToHost = false } } }
  })

  # NetBird node-level overlay. CPs and workers join with DIFFERENT setup keys so they
  # land in different groups: CPs → [talos, talos_cp], workers → [talos]. talos_cp is
  # the CP-only router group for the kube-cp network — the workers must NOT be in it, or
  # NetBird treats them as kube-cp routers and they never install the client route (their
  # pods can't reach the apiserver). See the netbird stack for the group/router wiring.
  # Both CP + worker run netbird in its normal (modern) mode. The pod→routed-subnet
  # problem — Cilium's eBPF host-routing does its FIB lookup against the MAIN table
  # only, so any route netbird parks in a policy table (it has been observed using
  # both main and table 7120 across versions/restarts) is invisible to POD egress,
  # and pod→apiserver via kube-cp gets "no route to host" — is fixed DETERMINISTICALLY
  # on the workers by worker_netbird_route_patch (a Talos-managed main-table route),
  # NOT by pinning netbird to its deprecated NB_USE_LEGACY_ROUTING mode. CPs don't
  # run the eBPF pod-datapath to routed subnets (their control-plane pods are
  # hostNetwork → host stack, which honors policy routing), so they need no route.
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

  # DETERMINISTIC pod→apiserver fix: a Talos-managed route for the kube-cp subnet
  # (apiserver + private API LB, reachable only over the mesh) into the MAIN table
  # via wt0 — exactly where Cilium's eBPF FIB lookup reads. netbird still installs
  # its own route (its table is version-dependent); ours guarantees main is
  # populated regardless, so pod egress to kube-cp always resolves. Declaring a
  # route on wt0 does NOT disturb the netbird extension (it keeps owning wt0's
  # address; Talos only adds the route). Workers only — CPs are ON kube-cp.
  worker_netbird_route_patch = yamlencode({
    machine = {
      network = {
        interfaces = [{
          interface = "wt0"
          routes    = [{ network = local.kube_cp_cidr }]
        }]
      }
    }
  })

  # nodeIP selection:
  #   CPs    → kube-cp hcloud private subnet (apiserver↔CP-kubelet stays private;
  #            decoupled from NetBird readiness at boot)
  #   workers → kube fabric IP. All workers share VLAN-10 L2, so Cilium
  #            autoDirectNodeRoutes routes pod east-west directly over the 50G
  #            fabric — no BGP, no overlay.
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

  cp_base_patches = compact([local.cp_install_patch, local.hostdns_patch, local.cp_netbird_patch, local.cp_nodeip_patch])
  # Workers ARE NetBird peers: the apiserver lives on the kube-cp hcloud net, only
  # reachable over the mesh, and workers resolve the API endpoint via the yucca.internal
  # NetBird DNS zone. nodeIP stays on the fabric (worker_nodeip_patch) so pod east-west
  # rides VLAN 10; only the API control path uses NetBird.
  # (install patch is PER-WORKER — by disk serial — appended in workers.tf)
  worker_base_patches = compact([local.hostdns_patch, local.worker_mayastor_patch, local.worker_volumes_patch, local.worker_netbird_patch, local.worker_netbird_route_patch, local.worker_nodeip_patch])

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
        # Dial kubelets by HOSTNAME first (Talos's default is InternalIP-first). The
        # worker InternalIPs are fabric addresses only reachable via the mgmt NetBird
        # routers — a single flappy bridge that intermittently broke logs/exec. Worker
        # hostnames resolve (via the CPs' extraHostEntries below) to the workers' OWN
        # NetBird IPs, so apiserver→kubelet is peer-to-peer over the mesh — the same
        # always-on tunnels the kubelets already use to reach the apiserver. The CP
        # hostnames resolve via hcloud DNS to their kube-cp IPs, unchanged.
        extraArgs = { "kubelet-preferred-address-types" = "Hostname,InternalIP,ExternalIP" }
        # hostNetwork pods get /etc/hosts COPIED at sandbox creation — a host-level
        # extraHostEntries refresh never reaches the RUNNING apiserver. Stamping the
        # entry-set hash into the pod spec forces kubelet to recreate the pod (fresh
        # /etc/hosts) whenever a worker's mesh IP changes (e.g. re-provision).
        env = { MESH_HOSTS_REVISION = substr(sha256(jsonencode(local.cp_host_entries)), 0, 12) }
      }
      # Pin etcd to the kube-cp hcloud subnet so CP↔CP etcd stays off the mesh.
      etcd = { advertisedSubnets = [local.kube_cp_cidr] }
    }
  })

  # CP node extras:
  #  • ip_forward — the CPs are the NetBird route peers for the kube-cp subnet
  #    (yucca-fsn-father-kube-cp), so they must forward overlay↔subnet traffic.
  #  • extraHostEntries — on the CPs, resolve api_dns_name to the 3 CP private IPs
  #    (round-robin, all in the cert SANs). NOT the LB VIP (CPs are LB targets →
  #    hcloud hairpin), and NOT 127.0.0.1 (a joining CP must reach a WORKING
  #    apiserver — a peer's — to register its etcd membership; its own apiserver
  #    isn't up until etcd joins). Off-node peers resolve api_dns_name via the
  #    NetBird yucca.internal zone.
  #  • kubelet dialing (worker_mesh_kubelet): the apiserver prefers the Hostname node
  #    address (cp_cluster_patch), so every node hostname must resolve on the CPs:
  #    CP hostnames → their kube-cp IPs (stable), worker hostnames → their NetBird
  #    IPs (data.netbird_peer — the peer-to-peer mesh path, no mgmt route). Talos
  #    host-dns can't resolve NetBird DNS zones, hence /etc/hosts, which the
  #    hostNetwork apiserver inherits.
  cp_host_entries = concat(
    [for ip in local.cp_private_ips : { ip = ip, aliases = [local.api_dns_name, local.legacy_api_dns_name] }],
    [for i, ip in local.cp_private_ips : { ip = ip, aliases = [local.cp_hostnames[i]] }],
    [for i, p in data.netbird_peer.worker : { ip = p.ip, aliases = [local.worker_hostnames[i]] }],
  )

  cp_extras_patch = yamlencode({
    machine = {
      sysctls = { "net.ipv4.ip_forward" = "1" }
      network = { extraHostEntries = local.cp_host_entries }
    }
  })

  # ── Per-CP patches (hostname + hcloud private NIC for etcd) ───────────────
  # eth0 = hcloud public (DHCP, default route); eth1 = hcloud private (etcd).
  # eth1 MUST be DHCP: hcloud private networks are SDN, not L2 — servers reach each
  # other via the network gateway, and hcloud's DHCP is what installs the private
  # IP (the one pinned in the hcloud_server network block) + the gateway route. A
  # static /24 here makes the node try direct same-subnet ARP, which the SDN doesn't
  # answer → the CPs can't reach each other → etcd never forms. VERIFY eth1 is the
  # private NIC on the snapshot (else use a deviceSelector).
  cp_node_patches = [for i in range(local.c.cp_count) : [
    yamlencode({
      machine = {
        network = {
          interfaces = [{
            interface = "eth1"
            dhcp      = true
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

# Worker NetBird peers — their mesh IPs feed the CPs' /etc/hosts (cp_host_entries)
# so the apiserver dials worker kubelets peer-to-peer. Lookup is by peer name
# (= the worker hostname; the netbird stack keeps one live peer per node). Gated:
# on a greenfield bootstrap the workers aren't peers yet — set
# cluster.worker_mesh_kubelet = false, then flip it after they join.
data "netbird_peer" "worker" {
  count = local.c.worker_mesh_kubelet ? length(local.c.workers) : 0
  name  = local.worker_hostnames[count.index]
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
  cp_public_ips = hcloud_server.control_plane[*].ipv4_address
  # Everything the talos provider dials — bootstrap, kubeconfig, talosconfig, health,
  # and the helm/kubernetes providers — uses the PRIVATE kube-cp IPs, reachable from
  # the apply host over the NetBird kube-cp route (and in the cert SANs). No public
  # access is required to bring the cluster up (the CPs keep public IPs only for
  # NetBird NAT traversal + egress; apid/apiserver are firewalled off the internet).
  bootstrap_endpoint = local.cp_private_ips[0]
  operator_endpoint  = "https://${local.cp_private_ips[0]}:6443"
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

# talosconfig endpoints = CP private kube-cp IPs (reached over NetBird; no public).
data "talos_client_configuration" "this" {
  cluster_name         = local.c.name
  client_configuration = talos_machine_secrets.this.client_configuration
  endpoints            = local.cp_private_ips
  nodes                = concat(local.cp_private_ips, [for w in local.c.workers : w.fabric_ip])
}

locals {
  kube_client_config = talos_cluster_kubeconfig.this.kubernetes_client_configuration
}

# Talos/etcd health after workers are applied; k8s-Ready is skipped (Cilium lands
# after, in cilium.tf).
data "talos_cluster_health" "this" {
  count = var.bootstrap_health_gate ? 1 : 0

  client_configuration   = talos_machine_secrets.this.client_configuration
  control_plane_nodes    = local.cp_private_ips
  worker_nodes           = [for w in local.c.workers : w.fabric_ip]
  endpoints              = local.cp_private_ips
  skip_kubernetes_checks = true
  timeouts               = { read = "10m" }

  depends_on = [
    talos_machine_bootstrap.this,
    talos_machine_configuration_apply.worker,
  ]
}
