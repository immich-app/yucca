# prod/htz-fsn1/talos — the `father` cluster

Hybrid production Talos Kubernetes cluster: **3 Hetzner Cloud control-plane VMs +
3 Hetzner Robot bare-metal workers**, one cluster. Flux is **deferred** — this
stack brings up a healthy, Cilium-networked cluster and stops there.

## Topology

```
            ┌──────────── Hetzner Cloud (fsn1) ────────────┐
            │  cp-1  cp-2  cp-3   (CCX23, Talos snapshot)   │
            │   • public IPv4  → NetBird + bootstrap + LB    │
            │   • kube-cp 10.40.11.0/24 (eth1) → etcd        │
            │   • API LB (lb11) → :6443, public + private    │
            └───────┬───────────────────────┬───────────────┘
        NetBird mesh│ (CP route to fabric    │ public LB :6443 (api_dns_name)
        via mgmt    │  net, advertised)      │
            ┌───────┴───────────────────────┴───────────────┐
            │   Juniper fabric — kube VLAN 10 / 10.40.10.0/24 │
            │   wk-1 .11   wk-2 .12   wk-3 .13   (bond0, 50G)  │
            │   • nodeIP = fabric IP → Cilium autoDirectNodeRoutes │
            │     puts pod east-west directly on the 50G fabric    │
            └─────────────────────────────────────────────────┘
```

| Plane | Path | Carries |
|---|---|---|
| node / control | NetBird (CP) → mgmt routers → `kube` fabric | apiserver↔kubelet, CP→worker |
| API endpoint | public Hetzner Cloud LB (`api_dns_name`) | kubelet→apiserver, operators |
| etcd | `kube-cp` hcloud private subnet (`10.40.11.0/24`) | CP↔CP |
| pod east-west | `kube` fabric VLAN 10 (50G), `autoDirectNodeRoutes` | worker↔worker pods |

No vSwitch, no BGP. **Cilium BGP is reserved for north-south later** (advertising
ingress/LoadBalancer VIPs to the fabric leaf, which already speaks BGP).

## Bring-up flow (single `tf:apply`)

1. `image.tf` — look up the Talos amd64 hcloud snapshot (built once out-of-band).
2. `network.tf` — hcloud network + the kube-cp cloud subnet.
3. `controlplane.tf` — 3 CP VMs (config via `user_data`) + the API LB.
4. `talos.tf` — `talos_machine_bootstrap` against cp-1's public IP → kubeconfig.
5. `workers.tf` — `talos_machine_configuration_apply` to each worker over apid
   (its fabric IP, reached via NetBird→mgmt→fabric).
6. `cilium.tf` — Cilium via Helm → post-CNI health gate → Ready cluster.

## Prerequisites (before `tf:apply`)

- **`HCLOUD_TOKEN`** — create the hcloud project + read/write token, store at
  `op://yucca_tf_prod/HCLOUD_API_TOKEN` (see `tf/.env.prod`).
- **Talos schematic** — the extension set lives in `schematic.yaml` and is
  registered with the factory by TF (`talos_image_factory_schematic`, `image.tf`);
  the schematic id + image URLs derive from it. Edit `schematic.yaml` to change it.
- **hcloud snapshot** — build it once with `mise run hetzner:talos-image` (reads the
  image URL from `tofu output`; idempotent, `FORCE=1` to rebuild). `image.tf`
  resolves it by label.
- **NetBird setup key** — minted by the netbird stack; path in `tf/.env.prod`.
- **Workers in maintenance mode** — provisioned to Talos maintenance at their
  `fabric_ip` (10.40.10.11/.12/.13). See the runbook below.
- **DNS** — after apply, point `api_dns_name` (output) at the LB public IPv4
  (output `api_dns_record`).
- **`trusted_cidrs`** — MUST include the source the TF runner dials the CP public
  IPs from (CI egress / your NetBird range), or bootstrap (apid 50000) hangs.

> CI owns `tf:apply` (`.github/workflows/infra.yml`). Locally use `tf:plan` only.

## Phase-4: worker provisioning runbook (rescue → Talos maintenance)

The workers (Robot server numbers 3008210/11/12) must boot Talos in maintenance
mode at their fabric IP before this stack applies. Per worker:

1. Robot → enable the **rescue system** (linux64) for the server, reboot into it.
2. `dd` the Talos **metal** image for the cluster schematic onto the boot disk:
   ```sh
   wget -O /tmp/talos.raw.xz \
     "https://factory.talos.dev/image/<schematic-id>/v1.13.4/metal-amd64.raw.xz"
   xz -dc /tmp/talos.raw.xz | dd of=/dev/sda bs=4M && sync
   ```
3. Reboot off the rescue system → Talos comes up in maintenance mode.
4. Bring up `bond0` over the two 25G NICs with the tagged **kube VLAN 10** carrying
   the node's `fabric_ip` (matching `clusters.auto.tfvars`), so the TF runner can
   reach apid (50000) over the fabric. (This stack then pins the same config.)

This mirrors the mgmt-host reprovision pattern (`../mgmt-hosts.yaml` + the fabric
stack's `mgmt.tf`); a future iteration can drive it from TF/Ansible.

## Notes

- **Bootstrap is one-shot.** Re-applying does not re-bootstrap; tainting
  `talos_machine_bootstrap.this` re-rolls cluster identity — don't.
- CP VMs have `ignore_changes = [user_data, image]` so re-applies don't recycle
  live nodes; change them deliberately (cordon/drain first).
- Flux activates later from `kubernetes/clusters/prod/htz-fsn1` (already scaffolded).
