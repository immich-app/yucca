# prod/htz-fsn1/talos — the `father` cluster

All-bare-metal production Talos Kubernetes cluster: **3 Hetzner Robot control
planes + 3 Hetzner Robot workers**, every node plane on the Juniper fabric. The
previous hybrid topology (3 Hetzner Cloud CP VMs + hcloud API LB + NetBird as the
CP↔worker plane) is retired; NetBird remains on every node as the **operator /
backup plane** only.

## Topology

```
          ┌──────────────── Juniper fabric (site 40) ─────────────────┐
          │  kube-cp VLAN 11 — 10.40.11.0/24 (gw .1 = spine IRB)      │
          │  cp-harlan .11   cp-imelda .12   cp-roscoe .13            │
          │  API VIP 10.40.11.5 (Talos etcd-elected)                  │
          │  bond0 2×10G (ixgbe, spine port-0 4×10G breakout, ae4-6)  │
          ├───────────────── spine routes irb.11 ↔ irb.10 ────────────┤
          │  kube VLAN 10 — 10.40.10.0/24 (gw .1 = spine IRB)         │
          │  wk-jeanne .11   wk-sheron .12   wk-dianna .13            │
          │  bond0 2×25G (bnxt_en, spine port-2 4×25G breakout, ae1-3)│
          └───────────────────────────────────────────────────────────┘
             every node: onboard public NIC (DHCP) = default route/egress
                         + NetBird (operator plane; CPs route kube-cp)
```

| Plane | Path | Carries |
|---|---|---|
| etcd + API endpoint | `kube-cp` VLAN 11, VIP `10.40.11.5` (`api_dns_name` → VIP) | CP↔CP etcd, apiserver, VIP |
| CP↔worker | routed `kube`↔`kube-cp` via the spine IRBs (static routes in machine config) | apiserver↔kubelet, geneve |
| pod east-west | `kube` VLAN 10 (50G), geneve tunnel | worker↔worker pods |
| operators / CI | NetBird → kube-cp route (the CPs are the route peers) | talosctl/kubectl/TF |

**Cilium BGP** (north-south LoadBalancer VIPs) stays workers-only against the
spine's VLAN-10 IRB.

## Bring-up flow (single `tf:apply`)

1. `image.tf` — register the schematic (one, metal, **no qemu-guest-agent**).
2. `controlplane.tf` — apid config apply to each CP (maintenance `maint_ip` on the
   first pass) → install to disk (by serial) + reboot onto bond0.11.
3. `talos.tf` — `talos_machine_bootstrap` against cp-1 (`10.40.11.11`, reached
   over the NetBird kube-cp route once cp-1's netbird is up) → kubeconfig.
4. `workers.tf` — apid apply to each worker (maintenance `maint_ip` first pass).
5. `cilium.tf` — Cilium via Helm → post-CNI health gate.
6. `flux.tf` — flux-operator + instance → GitOps takes over
   (`kubernetes/clusters/prod/htz-fsn1`).

## Prerequisites (before `tf:apply`)

- **Fabric** — the fabric stack applied with `breakout_ports` port 0 = 10g, the
  kube-cp VLAN/IRB, and `cp_node_lags` ae4-6. Leg pairing in `../fabric/fabric.tf`
  was verified 2026-07-15 by MAC-learning against the maintenance-mode nodes
  (QSFP+ 4×10G breakout cables installed; all six legs link at 10G). Re-verify if
  anything is re-cabled — LACP won't aggregate legs facing different nodes.
- **Nodes in maintenance mode** — every node with `provisioned = false` must be
  in Talos maintenance at its `maint_ip`. Rescue → dd runbook below.
- **NetBird setup keys** — minted by the netbird stack; paths in `tf/.env.prod`.
- **Operator/CI NetBird networks selected** — the apply host reaches the CPs via
  the `yucca-fsn-father-kube-cp` NetBird network (and the switches/workers via
  `htz-fsn1-mgmt` / `htz-fsn1-kube`). With client ≥0.75 lazy network selection,
  `netbird networks select <name>` or routes silently don't install.
- **`trusted_cidrs`** — MUST include the source the TF runner dials the CPs from
  (the NetBird range), or bootstrap (apid 50000) hangs.

> CI owns `tf:apply` (`.github/workflows/infra.yml`). Locally use `tf:plan` only.

## Node provisioning runbook (rescue → Talos maintenance)

Per node (CPs: Robot 3027819/3027863/3028524; workers: 3008210/11/12):

1. Robot → enable the **rescue system** (linux64), reboot into it.
2. `dd` the Talos **metal** image for the cluster schematic onto the install disk
   (`tofu output talos_metal_image_url`):
   ```sh
   wget -O /tmp/talos.raw.xz "$(tofu output -raw talos_metal_image_url)"
   xz -dc /tmp/talos.raw.xz | dd of=/dev/sda bs=4M conv=fsync && sync
   ```
   Record the disk's SERIAL (`lsblk -d -o NAME,SERIAL`) — it pins
   `install_serial` in `clusters.auto.tfvars`.
3. Reboot off the rescue system → Talos comes up in maintenance mode on the
   public NIC (DHCP) = the node's `maint_ip`. (If it lands back in rescue, the
   rescue flag didn't clear — just reboot again.)
4. Set the node's `provisioned = false` in tfvars → apply → flip to `true` once
   it has joined.

## Cutover runbook (hybrid → all-bare-metal REBUILD) — EXECUTED 2026-07-15

The rebuild keeps `talos_machine_secrets` (cluster PKI) but re-bootstraps etcd on
the new CPs and re-installs the workers. **In-cluster state (Mayastor/localpv) is
lost**; Flux redeploys everything. The steps below were executed 2026-07-15 (all
stacks now plan clean); kept as the reference for any future rebuild. Order
matters:

1. **Fabric first** (CI orders fabric before talos): apply lands the kube-cp
   VLAN/IRB + ae4-6. Port-0 10g channelization is already live on the spine
   (set 2026-07-15, identical to the TF config) and the leg pairing is verified —
   after the apply, `show lacp interfaces` should show ae4-6 collecting once the
   CPs boot their bonds.
2. **New CPs in maintenance mode** (done 2026-07-15): rescue → dd → maintenance
   at 178.63.124.20/.21/.22.
3. **State surgery** (forgets, no destroys — safe with prevent_destroy):
   ```sh
   tofu state rm talos_machine_bootstrap.this        # re-bootstrap on the new cp-1
   tofu state rm talos_cluster_kubeconfig.this
   tofu state rm helm_release.cilium helm_release.flux_operator helm_release.flux_instance
   tofu state rm kubernetes_secret_v1.github_app kubernetes_namespace_v1.cert_manager kubernetes_secret_v1.cloudflare_api_token
   ```
4. **Reset the workers** to maintenance mode (wipes them — deliberate):
   ```sh
   talosctl -n 10.40.10.11 reset --graceful=false --reboot \
     --system-labels-to-wipe STATE --system-labels-to-wipe EPHEMERAL   # × each worker
   ```
   They come back in maintenance at their `maint_ip` (public DHCP).
5. **Merge/apply this stack**: destroys the hcloud CP VMs + LB + network +
   firewall (their prevent_destroy left with the deleted config), applies CP
   configs → bootstrap → workers → Cilium → Flux.
6. Flip every node's `provisioned = true` once joined; rotate operator
   kubeconfigs (`op read`, secrets.tf rewrote them).

Rebuild gotchas hit on 2026-07-15 (expect them again):
- **The first apply fails partway** — helm dials the apiserver seconds after
  bootstrap (connection refused) and the kubernetes/1P resources throw
  "inconsistent final plan" (provider config unknowable at plan). Just re-apply;
  nothing is damaged. A helm wait-timeout can strand a `failed` release
  ("cannot re-use a name that is still in use") — `helm uninstall` it first.
- **flux-operator waits on the first worker** (CPs are unschedulable) — worker
  install+join takes longer than helm's 5m wait. Re-apply once workers are Ready.
- **CoreDNS chicken-and-egg**: `cluster.coreDNS.disabled=true` from t=0 means NO
  cluster DNS until Flux deploys ours — but flux-operator needs DNS to fetch its
  manifests from ghcr.io. Break the cycle once per rebuild:
  `kubectl apply -f kubernetes/apps/prod/htz-fsn1/coredns.yaml` (the exact
  objects Flux owns — it adopts them unchanged).
- ~~CRD deadlock (flat kustomization)~~ — fixed structurally after the rebuild:
  the tree is layered (`cluster-infra` = operators/CRD providers with
  `wait: true`; `cluster-apps` dependsOn it — see clusters/prod/htz-fsn1/
  apps.yaml). A fresh cluster converges without manual CRD pre-installs; the
  only remaining hand-step is the CoreDNS one above (it predates Flux itself).
- **Stale NetBird peers**: re-provisioned nodes join as NEW peers; the old
  same-named peers linger disconnected and break the netbird stack's
  `data.netbird_peer` lookups ("cannot match multiple peers"). Delete the
  disconnected duplicates (API/console) before applying the netbird stack.
- **`talosctl reset --wait=false`** — the default wait can never complete (the
  node comes back at a different IP, in maintenance mode).
- ~~Hand-created netops secrets die with the cluster~~ — fixed: the netops
  namespace + netops-ssh/grafana-admin/hyperglass-devices Secrets are TF-owned
  now (netops-secrets.tf, sourced from 1P), restored by the normal apply.

## Notes

- **Bootstrap is one-shot.** Re-applying does not re-bootstrap; replacing
  `talos_machine_bootstrap.this` re-rolls cluster identity — don't (the state-rm
  in the cutover is the deliberate exception).
- The API VIP is etcd-elected: it exists only while a healthy CP holds it. The
  bootstrap/operator path deliberately dials cp-1's IP, not the VIP.
- The old hcloud snapshot build task (`hetzner:talos-image`) is retired — all
  nodes boot the factory **metal** image via the rescue-dd runbook.
