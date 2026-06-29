# yucca/ansible/talos

> **Status: second-class, not actively used.** This converged/libvirt Talos
> substrate is maintained at low priority and is not part of the actively-run
> deployment. Treat the docs in this subtree as informational -- they may lag
> the live stacks; validate against current code before relying on any step.

Hyper-converged Talos K8s on the 3-node Sietch Ceph cluster. Those hosts
have idle CPU + memory headroom (Ceph spends its budget on disk and
network I/O), so the Talos VMs run there instead of on dedicated K8s
hardware.

This subtree is the **Ansible substrate**: it provisions the VLAN 50/51
bridges, the libvirt/KVM stack, and stages the Talos VMs — stopping when
the VMs are running and ready for `talosctl`. The Terraform half in
[tf/deployment/staging/austin/talos/](../../tf/deployment/staging/austin/talos/) renders the
Ansible inventory and drives cluster bring-up (machine config, bootstrap,
kubeconfig).

That boundary is deliberate: Ansible stays declarative and idempotent, and
the one-shot cluster bootstrap (etcd init, cluster CA) lives in Terraform.
Mixing a one-shot bootstrap into idempotent plays is awkward, and keeping
cluster secrets out of Ansible's fact cache keeps the blast radius small.

## Scope (in)

- VLAN 50 (Compute, `10.50.0.0/16`) + VLAN 51 (Services, `10.51.0.0/16`)
  L2 bridges on each hypervisor's `bond0`.
- Idempotent install of qemu-kvm + libvirt-daemon + ovmf + virtinst.
- `br_netfilter` bypass so Talos VM↔VM traffic isn't dropped by Ceph's
  existing `inet filter` forward DROP.
- Fetch + checksum-verify + stage the official Talos `metal-amd64` image.
- Define and start Talos VMs per profile.

## Scope (out)

- `talosctl gen config / apply-config / bootstrap` — the Terraform
  `siderolabs/talos` provider owns these
  ([tf/deployment/staging/austin/talos/](../../tf/deployment/staging/austin/talos/));
  `docs/operator-handoff.md` keeps the manual sequence for recovery.
- Persistent storage for VMs (RBD-backed boot disks, ceph-csi). Boot
  disks are local qcow2 today; RBD lands in a follow-up.
- Switch/VLAN tagging — assumed already done upstream (VLAN 50/51 tagged
  on every hypervisor's bond0 uplink).
- GitOps / Flux / workloads — land after the storage follow-up.

## Hardware

| Host                | Role              | Full VMs                          |
|---------------------|-------------------|-----------------------------------|
| sietch-ceph-laurel  | Ceph + hypervisor | sietch-talos-cp1, worker1         |
| sietch-ceph-lawson  | Ceph + hypervisor | sietch-talos-cp2, worker2         |
| sietch-ceph-samara  | Ceph + hypervisor | sietch-talos-cp3, worker3         |

Full profile (production, the default everywhere) = 3 CP + 3 workers,
one CP + one worker per hypervisor (each host is its own failure
domain). Smoke profile = cp1 + worker1 on laurel — a single-host
validation tool, selected explicitly with `-e profile=smoke`.

## Operator workflow

Inventory is **TF-rendered** from `tf/deployment/staging/austin/talos/`. Run TF first
(from the repo root):

```bash
TF_STACK_DIR=tf/deployment/staging/austin/talos mise run tf:init    # first time only
TF_STACK_DIR=tf/deployment/staging/austin/talos mise run tf:apply   # renders inventory + host_vars
```

Then point at the rendered inventory and use the talos-subtree tasks:

```bash
cd ansible/talos/
export TALOS_ENV=inventories/staging-austin/inventory.ini

mise run setup       # first time only: python venv + ansible collections
mise run lint        # yamllint + ansible-lint + shellcheck
mise run check       # ansible-playbook --syntax-check all playbooks
mise run preflight   # SSH + Ceph health + bond0 + /dev/kvm
mise run prepare-hypervisors  # idempotent infra (bridges + libvirt + image)
mise run provision   # production full profile (default: 3 CP + 3 workers)
# single-host validation instead: mise run provision -- -e profile=smoke
```

After provision: the Terraform stack takes over cluster bring-up. See
`docs/runbooks/cluster-bring-up.md` for the end-to-end flow, and
`docs/operator-handoff.md` for driving `talosctl` by hand when recovering.

## Safety posture

- All roles refuse to do anything unless their `*_enabled` flag is set
  (defaults false). The prepare-hypervisors playbook flips them.
- preflight is `import_playbook`'d by prepare + provision — Ceph HEALTH_OK
  enforcement is automatic.
- Network changes are config-only and applied via `networkctl reload`,
  never `systemctl restart systemd-networkd` (preserves Ceph storage VLAN).
- `mise run destroy-vms` removes VMs + overlays only; bridges, libvirt,
  and the base image stay intact for fast redeploy.

See `docs/runbooks/smoke-plan.md` for single-host validation (smoke
profile, bounded first pass on a fresh hypervisor, rollback paths).
