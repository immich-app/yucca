# Smoke profile: single-host validation

Smoke is a validation tool, not a deployment target. It runs the minimum
useful cluster — one control plane + one worker, both on **laurel** — so
substrate or bootstrap changes can be exercised end-to-end on a single
host before rolling them out to the production topology (full profile,
3 CP + 3 workers, the default everywhere).

> **Authoritative flow:** the full step-by-step (TF render → Ansible
> substrate → TF bootstrap → kubeconfig) lives in
> [`cluster-bring-up.md`](./cluster-bring-up.md). This page only covers
> what's *different* when validating with smoke.

## Topology

| Host                | VM      | Role          | Static IP   | Resources               |
|---------------------|---------|---------------|-------------|--------------------------|
| sietch-ceph-laurel  | cp1     | control-plane | 10.50.5.11  | 4 GiB / 2 vCPU / 50 GiB  |
| sietch-ceph-laurel  | worker1 | worker        | 10.50.5.21  | 8 GiB / 4 vCPU / 100 GiB |

Single-host on purpose: fastest path to a running cluster with the
smallest blast radius. No etcd quorum (one CP) and no cross-host
failure-domain coverage — never leave a real deployment here.

## Selecting smoke

Smoke is always an explicit choice — full is the default on both the
Ansible and TF sides. Pass `-e profile=smoke` on the provision step and
set `profile = "smoke"` in `clusters.auto.tfvars` before `tf:apply`:

```bash
# Ansible substrate — smoke override (full is the default)
mise run provision -- -e profile=smoke

# TF bootstrap — set profile = "smoke" in clusters.auto.tfvars first
TF_STACK_DIR=tf/deployment/staging/austin/talos mise run tf:apply
```

Everything else (static `ip=` addressing, factory image, direct kernel
boot, the VLAN-50 route the operator workstation needs for TF bootstrap)
is identical to the full flow — see
[`cluster-bring-up.md`](./cluster-bring-up.md).

## Bounded first pass on a fresh hypervisor

When a substrate change is risky (networkd units, OVMF paths, nftables
sysctls), tighten the blast radius further: smoke profile **plus**
`--limit sietch-ceph-laurel`, phase by phase. Both smoke VMs live on
laurel, so the limit costs nothing.

```bash
cd ansible/talos
export TALOS_ENV=inventories/staging-austin/inventory.ini

# A. preflight only — read-only, zero state change
scripts/ansible-play.sh preflight.yml --limit sietch-ceph-laurel

# B. substrate — bridges + libvirt + nftables bypass + boot assets
scripts/ansible-play.sh prepare-hypervisors.yml --limit sietch-ceph-laurel

# C. VMs — cp1 + worker1 on laurel
scripts/ansible-play.sh provision-vms.yml -e profile=smoke \
  --limit sietch-ceph-laurel

# D. idempotency — re-run B + C; both must report changed=0
```

**Spot-checks between phases:**

```bash
# After B — substrate landed?
ssh sietch-ceph-laurel "ip -br link show br-vlan50 br-vlan51 bond0.50 bond0.51"
ssh sietch-ceph-laurel sudo virsh pool-list
ssh sietch-ceph-laurel ls -lh /var/lib/libvirt/images/
ssh sietch-ceph-laurel sudo sysctl net.bridge.bridge-nf-call-iptables  # expect 0
ssh sietch-ceph-laurel sudo ceph -s                                    # HEALTH_OK unchanged

# After C — VMs up and reachable on their static IPs?
ssh sietch-ceph-laurel sudo virsh list
ping 10.50.5.11                                  # from a host with VLAN-50 reach
talosctl -n 10.50.5.11 version --insecure        # maintenance mode until TF applies
```

Any `changed>0` on the second B/C run is a bug — investigate before
expanding. When laurel passes, drop `--limit` and the smoke override and
provision the full profile (see Returning to full below).

### If something goes wrong

| Symptom | Likely cause | Recovery |
|---------|--------------|----------|
| Ceph shifts to HEALTH_WARN/ERR mid-run | networkd reload disturbed bond carrier (shouldn't — the drop-in only adds `VLAN=` to the parent), or coincidence | Halt. `ceph health detail` on the host; investigate before any further play. |
| `networkctl reload` fails / invalid units | Template bug | `networkctl status`; inspect `/etc/systemd/network/50-*`. Roll back: remove `50-bond0.5*`, `50-br-vlan*`, and `20-bond0.network.d/`, then `networkctl reload`. |
| bridge-nf sysctl set fails | `br_netfilter` won't load | `modinfo br_netfilter`; if truly absent it's a kernel-config issue — stop. |
| Image fetch fails (checksum mismatch) | Pinned SHA stale, or schematic/version changed | Recompute from the factory artifact (`curl -sL <url> \| sha256sum` — the `.sha256` sidecar is enterprise-only), update group_vars, retry. |
| qcow2 create fails | No space in `/var/lib/libvirt/images` | `df -h` the pool path. Overlays are sparse (smoke: 50 + 100 GiB virtual); real usage grows with writes. |
| Domain start fails: "Could not open OVMF" | OVMF paths don't match the distro's package | `dpkg -L ovmf \| grep -E 'CODE\|VARS'`; override `talos_vms_ovmf_*` in group_vars. |
| VM up but unreachable on VLAN 50 | bridge-nf bypass didn't take, or switch port not tagging VLAN 50 | Re-check the sysctls; `bridge fdb show br br-vlan50` should list the VM's MAC; verify switch tagging. |

### Rollback paths (increasing destructiveness)

```bash
# 1. Remove the VMs only — no infra change
mise run destroy-vms -- --limit sietch-ceph-laurel

# 2. Also revert the nftables sysctls
mise run rollback-nftables-bridges -- --limit sietch-ceph-laurel

# 3. Manual: remove the networkd units + drop-in (no playbook for this)
ssh sietch-ceph-laurel sudo bash -c '
  rm -rf /etc/systemd/network/20-bond0.network.d/
  rm -f /etc/systemd/network/50-bond0.5* /etc/systemd/network/50-br-vlan5*
  networkctl reload
'
```

## Success criteria

- `kubectl get nodes` → 2 Ready nodes (`sietch-talos-cp1`,
  `sietch-talos-worker1`) at the pinned K8s version.
- `talosctl health` passes.
- Re-running `prepare-hypervisors` + `provision` reports **0 changes**
  (idempotency — the test that distinguishes "works" from "battle-tested").

## Returning to full

Once the change validates, restore the production topology — see the
[Promotion smoke → full](./cluster-bring-up.md#promotion-smoke--full)
section of the authoritative runbook. In short: set `profile = "full"`
back in `clusters.auto.tfvars`, provision the remaining VMs on lawson +
samara (cp2/worker2, cp3/worker3), and re-apply TF; the existing
cp1/worker1 are a no-op, and the CP VIP at `10.50.0.10` gains a real
3-node etcd quorum behind it.
