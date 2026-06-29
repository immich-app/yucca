# Architecture: hyper-converged Talos on Sietch (converged)

## High-level

Three Sietch hosts already run Ceph OSDs (production HEALTH_OK).
This design adds a libvirt/KVM virtualization layer on top of those
same hosts and runs Talos VMs as guests. CPU + memory on the hosts
are mostly idle today (Ceph spends its budget on disk + network);
the VMs consume that headroom.

Storage for the VMs is local qcow2 today. A follow-up iteration
will switch boot disks to RBD on the existing Ceph cluster and add
`ceph-csi` for K8s PV provisioning.

Provisioning split across the monorepo:

| Subtree | Owns |
|---|---|
| `ansible/talos/` (this) | Hypervisor substrate: bridges, libvirt, image, VM definitions. Stops at "VMs ready"; Terraform owns bootstrap (the subtree README explains why the boundary sits here). |
| `tf/shared/modules/talos-cluster/modules/inventory-renderer/` | Renders the Ansible inventory + (future) `secrets.yml.tpl` from `tf/deployment/staging/austin/talos/clusters.auto.tfvars`. Parity with the ceph-cluster module. |
| `tf/shared/modules/talos-cluster/modules/talos-bootstrap/` | `siderolabs/talos` provider — machine_secrets, configuration_apply per node, bootstrap, kubeconfig. Drives the talosctl sequence so operators don't run it by hand. |

## Physical layout

```
┌──────────────────────────────────────────────────────────────────┐
│  sietch-ceph-laurel (10.10.10.90)                                │
│  ┌────────────────┐  ┌─────────────────────────────────────────┐ │
│  │ Ceph: OSDs +   │  │ libvirt VMs (talos_vms list, host_vars) │ │
│  │ MON/MGR/RGW    │  │   smoke: sietch-talos-cp1, worker1      │ │
│  │ on bond0       │  │   full:  cp1, worker1                   │ │
│  └────────────────┘  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
       │ bond0 (LACP/active-backup, depending on existing setup)
       ▼
   ┌───────────────────────────────────────────┐
   │ Switch — VLANs tagged upstream:           │
   │   VLAN 10 (untagged-ish)  — Ceph storage │
   │   VLAN 50  (tagged)       — Talos compute│
   │   VLAN 51  (tagged)       — Services/LB  │
   └───────────────────────────────────────────┘
       ▲                 ▲
       │ bond0           │ bond0
┌──────┴──────┐   ┌──────┴──────┐
│   lawson    │   │   samara    │
│ (10.10.10.91)│   │ (10.10.10.92)│
└──────────────┘   └──────────────┘
```

## Per-host network topology

Bond0 already exists (set up by the Ceph deployment). This subtree
adds two VLAN sub-interfaces and two L2 bridges:

```
                bond0 (10.10.10.x — Ceph storage VLAN)
                 │
                 ├── bond0.50  ── enslaved to ── br-vlan50  (Compute,
                 │                                            10.50.0.0/16,
                 │                                            VM attach)
                 │
                 └── bond0.51  ── enslaved to ── br-vlan51  (Services,
                                                             10.51.0.0/16,
                                                             LB/ingress)
```

Hypervisor itself does NOT participate in the IP layer of VLAN 50/51
— bridges are L2-only on the host. Talos VMs are STATICALLY addressed
on VLAN 50 (10.50.5.0/24, outside the DHCP pool): a per-VM `ip=` kernel
cmdline (libvirt direct kernel boot) sets the address at first boot, and
the Talos machine config persists it. Worker VLAN-51 NICs still DHCP
(metallb / ingress own those). NOTE: TF bootstrap reaches the VMs on
VLAN 50, so the operator workstation needs a route to 10.50.0.0/16 (a
tailnet/VPN subnet route, or being directly on the VLAN) before
`tf:apply` — see the bring-up runbook's Pre-conditions.

## Naming scheme

Monorepo FQDN: `<cluster>-<role>-<name>.<domain>` —
e.g. `sietch-talos-cp1.staging.austin.int.futo.cloud`. The
`<cluster>-<role>` prefix (`sietch-talos`) is the
`talos_domain_prefix` group_vars value; `<name>` is the entry in
each host's `host_vars/*.yml` talos_vms list.

Libvirt domain names match (`sietch-talos-cp1`). Talos hostnames
match — set by the hostname field of each VM's kernel `ip=` cmdline,
which is the *sole* source (Talos v1.13 rejects a duplicate hostname
in machine config). MACs are deterministic (52:54:00:50:XX:XX where
XX:XX is the first 4 chars of `sha1(name)`), so VMs are identifiable
at the switch/bridge level and the workers' VLAN-51 DHCP leases stay
stable across reprovisions.

## Talos cluster topology

### Full profile (production — the default)

| VM                  | Host    | Role          | IP          |
|---------------------|---------|---------------|-------------|
| sietch-talos-cp1    | laurel  | control-plane | 10.50.5.11  |
| sietch-talos-worker1| laurel  | worker        | 10.50.5.21  |
| sietch-talos-cp2    | lawson  | control-plane | 10.50.5.12  |
| sietch-talos-worker2| lawson  | worker        | 10.50.5.22  |
| sietch-talos-cp3    | samara  | control-plane | 10.50.5.13  |
| sietch-talos-worker3| samara  | worker        | 10.50.5.23  |

3-node CP gives etcd quorum (any single host can fail without
quorum loss). Each host carries exactly 1 CP + 1 worker, so a host
reboot takes 1 CP + 1 worker offline together — etcd stays at quorum
(2/3) and the worker pool drops to 2/3 capacity.

CP VIP `10.50.0.10` floats between the three CPs. Operators / kube
clients put this address (not a per-CP IP) in their kubeconfig.

### Smoke profile (single-host validation)

| VM                  | Host    | Role          | IP          | Notes                  |
|---------------------|---------|---------------|-------------|------------------------|
| sietch-talos-cp1    | laurel  | control-plane | 10.50.5.11  | Holds the CP VIP alone |
| sietch-talos-worker1| laurel  | worker        | 10.50.5.21  | Single-host bring-up   |

A validation tool, not a deployment target: both VMs on laurel, selected
explicitly (`-e profile=smoke` / `profile = "smoke"`), for exercising
substrate or bootstrap changes on one host before rolling them out to
all three. No etcd quorum (single CP); not HA.

**Talos API hygiene:** talosconfig endpoints point at the direct
per-CP IPs (NOT the VIP) per Talos docs — the VIP follows the
leader, and the leader is exactly what you can't reach during a
failure. The TF bootstrap's `talos_client_configuration` data source
splits `endpoints` (direct IPs) from `nodes` (full set) accordingly.

## Failure-domain notes

- **Hypervisor reboot**: takes 1 Ceph node + 1 CP + 1 worker offline.
  - Ceph: 3 → 2 nodes (depending on pool replication, usually
    keeps serving with read-only or degraded writes).
  - Talos: 3 → 2 CP (still quorum); 3 → 2 workers (66% capacity).
  - **Acceptable in lab. Production policy needs documenting.**

- **Disk failure on a hypervisor**: doesn't directly impact Talos
  unless the failing disk holds a qcow2 overlay. With local qcow2
  (current), one disk = the VMs whose overlays are on it. With RBD
  (follow-up), VM survives via RBD's replication.

- **VLAN 50 interruption** (switch reboot, port flap, bond
  flap-and-reconverge): all Talos VMs lose external network
  simultaneously. Talos itself tolerates this; K8s API is
  unreachable until the VLAN comes back.

- **Operator workstation loss**: irrelevant to running cluster, but
  rebuilding workstation requires re-fetching `talosconfig` from
  TF state or 1P.

## Storage roadmap

| Stage | Boot disks | K8s PVs | Notes |
|-------|------------|---------|-------|
| Today (full profile) | local qcow2 on hypervisor's OS root | none (no workloads need them yet) | 3 CP + 3 workers; virt + Talos + networking validated. |
| RBD migration | qcow2 on `talos-vms` RBD pool (SSD-backed, replicated) | `k8s-rbd` RBD pool via external-cluster ceph-csi | Next iteration. Switch storage pool definition; per-VM creation logic stays the same. |
| Production | RBD | RBD via ceph-csi | Promote workload deploys (Flux). |

## DNS posture

No internal DNS authority is required yet (confirmed by Talos-K8s
SME research — K8s works with raw IPs + upstream resolvers for image
pulls). The TF bootstrap sets
`machine.network.nameservers: [1.1.1.1, 8.8.8.8]` on Talos VMs for
upstream image-registry resolution. Kubeconfig uses
the CP VIP IP directly (`https://10.50.0.10:6443`). DNS records
under `*.compute.staging.austin.int.futo.cloud` and
`*.services.staging.austin.int.futo.cloud` land with the DNS-layer
follow-up (LB → ingress → external-dns).

## Out of scope

- Switch / VLAN configuration upstream.
- `talosctl gen config / apply-config / bootstrap` — owned by the
  talos-bootstrap module; [operator-handoff.md](operator-handoff.md)
  keeps the manual sequence for recovery.
- ceph-csi external cluster wiring.
- GitOps controllers (Flux), CNI choice + tuning (Cilium per the
  longer-term plan), ingress (Envoy Gateway), cert-manager,
  external-secrets, observability — all deferred until workloads land.
