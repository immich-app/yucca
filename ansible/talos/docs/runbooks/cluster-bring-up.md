# Cluster bring-up (TF-driven flow)

Authoritative runbook for getting a Talos K8s cluster running on the
Sietch hypervisors. The TF stack owns this flow;
[`operator-handoff.md`](../operator-handoff.md) keeps the manual
`talosctl` sequence for recovery.

## Pre-conditions

| Item | How to verify |
|------|---------------|
| Sietch Ceph HEALTH_OK | `ssh sietch-ceph-laurel sudo ceph -s` |
| 1Password desktop unlocked (or `OP_SERVICE_ACCOUNT_TOKEN` set) | `op account get` |
| Switch tagging VLAN 50 + 51 on all 3 hypervisor uplinks | Switch admin |
| UniFi DHCP excludes 10.50.0.10 (VIP) + 10.50.5.0/24 (static node range) | UniFi config |
| Operator workstation routes VLAN 50 (10.50.0.0/16) | `ip route get 10.50.0.10` resolves via the VLAN-50 route, not the default gateway |
| `mise trust` on the yucca worktree | `mise trust` |

## The 3-step flow

### Step 1 — TF render + Talos PKI (from ANY host with 1P + S3 creds)

```bash
cd <yucca>
TF_STACK_DIR=tf/deployment/dev/talos mise run tf:init    # first time
TF_STACK_DIR=tf/deployment/dev/talos mise run tf:apply
```

What lands:
- `inventories/sietch-talos.dev.austin.int/inventory.ini` and per-host
  `host_vars/*.yml` (the `talos_vms` lists), both rendered from
  `clusters.auto.tfvars` — `nodes[]` is the single source of truth for
  topology, so never hand-edit `host_vars`.
- `talos_machine_secrets` baked into TF state (PKI material — Talos CA
  + node ID secrets). **State lives in S3 at
  `s3://yucca-tf-state/ceph/dev/talos/terraform.tfstate`** (the `ceph/`
  prefix is the yucca-project misnomer; separate refactor tracked).

This step is safe to run from the operator workstation — only
local file rendering + S3 state + provider-local PKI generation, no
network calls to the cluster.

**IMPORTANT**: This step will ALSO want to apply machine_configuration
to the VMs. On a first run the VMs don't exist yet, so the apply
**fails on `machine_configuration_apply` — that's expected**: by then
the inventory + host_vars are rendered and `talos_machine_secrets` is
baked into state (neither needs the cluster). Proceed to step 2 and
re-run the apply in step 3.

### Step 2 — Ansible substrate (from the operator workstation)

```bash
cd <yucca>/ansible/talos
export TALOS_ENV=inventories/sietch-talos.dev.austin.int/inventory.ini

# Optional first time: bootstrap python venv + ansible collections
mise run setup

# Always: lint + syntax check
mise run lint
mise run check

# Always: preflight (Ceph HEALTH_OK gate)
mise run preflight

# Idempotent substrate (bridges + libvirt + boot assets: image +
# kernel + initramfs staged for direct kernel boot)
mise run prepare-hypervisors

# full profile (production, the default): 3 CP + 3 workers, 1 CP + 1
# worker per hypervisor. For single-host validation only, override with
# `-e profile=smoke` (cp1+worker1 on laurel).
mise run provision
```

After `mise run provision` you should see a MAC table printout. Each VM
direct-boots the staged Talos kernel + initramfs (NOT the on-disk
bootloader) with a per-VM `ip=` kernel cmdline, so it comes up at its
fixed 10.50.5.x address and sits in maintenance mode waiting for
`talosctl apply-config` — which the TF talos-bootstrap module handles
next. No DHCP-discovery step: the addresses are known in advance (they
live in `clusters.auto.tfvars` + host_vars, and are baked into the
kernel cmdline).

Verify VMs are alive (without touching talosctl; there's no default
inventory, so pass `-i`):
```bash
ansible hypervisors -i "$TALOS_ENV" -a "virsh list --state-running" -b
ansible hypervisors -i "$TALOS_ENV" -a "ip -br link show br-vlan50 br-vlan51" -b
```

### Step 3 — TF cluster bring-up (from the operator workstation)

`talos-bootstrap` reaches the VMs on VLAN 50 (10.50.5.0/24), so the
operator workstation needs a route to that subnet (Pre-conditions — a
tailnet/VPN subnet route, or being directly on the VLAN). Same working
copy and `mise run` as steps 1–2: no SSH hop, no repo copy onto a
hypervisor. The `tf/op-run.sh` wrapper resolves 1Password secrets from
the desktop app (or `OP_SERVICE_ACCOUNT_TOKEN` if set).

```bash
# Confirm VLAN-50 reach FIRST: this must go out the VLAN-50 route, not
# the default gateway. If it resolves via your default gateway, the
# route is missing and 10.50.5.x will black-hole — fix reachability
# before continuing.
ip route get 10.50.0.10

cd <yucca>
TF_STACK_DIR=tf/deployment/dev/talos mise run tf:apply
# Watch for:
#   - module.cluster["sietch"].module.talos_bootstrap.talos_machine_configuration_apply.controlplane["cp1"]: Creating...
#   - ... .talos_machine_bootstrap.this: Creating...
#   - ... .talos_machine_configuration_apply.worker["worker1"]: Creating...
#   - ... .talos_cluster_kubeconfig.this: Creating...
# Total ~5-10 min on first cold-boot.
```

### Step 4 — Extract kubeconfig + talosconfig

From the same shell on the operator workstation:

```bash
mkdir -p ~/.kube ~/.talos
# Use `output -json` alone — `-raw -json` are mutually exclusive and
# yield an empty file. op-run.sh resolves the S3 state creds.
tf/op-run.sh terragrunt \
  --working-dir tf/deployment/dev/talos output -json kubeconfigs \
  | jq -r .sietch > ~/.kube/sietch-talos.config
tf/op-run.sh terragrunt \
  --working-dir tf/deployment/dev/talos output -json talosconfigs \
  | jq -r .sietch > ~/.talos/sietch-talos.config

export KUBECONFIG=~/.kube/sietch-talos.config
export TALOSCONFIG=~/.talos/sietch-talos.config

kubectl get nodes
# NAME                  STATUS   ROLES           AGE   VERSION
# sietch-talos-cp1      Ready    control-plane   3m    v1.36.1
# sietch-talos-cp2      Ready    control-plane   3m    v1.36.1
# sietch-talos-cp3      Ready    control-plane   3m    v1.36.1
# sietch-talos-worker1  Ready    <none>          2m    v1.36.1
# sietch-talos-worker2  Ready    <none>          2m    v1.36.1
# sietch-talos-worker3  Ready    <none>          2m    v1.36.1

talosctl health
talosctl etcd members
```

If everything's Ready, cluster is up. Stash the configs to 1P (or
similar) — losing them means re-bootstrapping (rolls cluster identity).

## Tear-down

```bash
# Operator-side: drain workloads gracefully (optional)
kubectl drain --all --delete-emptydir-data --ignore-daemonsets

# Reset Talos state (zero etcd, wipe config) — workers FIRST, then CPs,
# so workers drain against a live control plane. Expect transient
# "failed to remove member … not enough started members" noise as the
# etcd quorum collapses on the CP pass; talosctl retries through it.
# (full profile IPs from clusters.auto.tfvars; for smoke, .11 + .21.)
talosctl reset --graceful --reboot \
  --nodes 10.50.5.21,10.50.5.22,10.50.5.23 \
  --endpoints 10.50.5.11,10.50.5.12,10.50.5.13
talosctl reset --graceful --reboot \
  --nodes 10.50.5.11,10.50.5.12,10.50.5.13 \
  --endpoints 10.50.5.11,10.50.5.12,10.50.5.13

# Destroy VMs + qcow2 overlays (Ansible side) — BEFORE tf:destroy, which
# deletes the rendered inventory.ini this play needs. (If you ran them in
# the wrong order: cp inventory.example.ini inventory.ini and re-run.)
cd <yucca>/ansible/talos
export TALOS_ENV=inventories/sietch-talos.dev.austin.int/inventory.ini
mise run destroy-vms

# Destroy TF cluster state, LAST (kubeconfig/talosconfig outputs blanked,
# rendered inventory + host_vars removed). -refresh=false is REQUIRED:
# the destroy otherwise re-reads data.talos_cluster_health against the
# wiped/destroyed nodes and aborts with "cluster health check failed".
# (Destroying the talos resources is state-only — nothing is un-applied.)
cd <yucca>
TF_STACK_DIR=tf/deployment/dev/talos mise run tf:destroy -- -refresh=false
```

To redeploy from clean: repeat steps 1 → 2 → 3 → 4. Static IPs are
declared in tfvars so a redeploy gets the same addresses.

## Promotion smoke → full

`full` is the default profile (3 CP + 3 workers). If you ran `smoke`
first (cp1 + worker1 on laurel) and want to expand to the full
production topology:

```bash
# 1. Restore the production profile in TF input — if you ran smoke, the
#    tfvars still says `profile = "smoke"` and the TF re-apply would
#    bootstrap nothing new:
#    tf/deployment/dev/talos/clusters.auto.tfvars → profile = "full"

# 2. Provision the remaining VMs on lawson + samara (cp2/worker2,
#    cp3/worker3). Existing cp1/worker1 are a no-op.
cd ansible/talos
mise run provision   # profile=full is the default

# 3. Re-apply TF for the 4 new node bootstraps (cp2/cp3 join etcd,
#    worker2/worker3 join the cluster)
cd ../..
TF_STACK_DIR=tf/deployment/dev/talos mise run tf:apply
```

NOTE: going from 1 CP (smoke) to 3 CP (full) grows the etcd quorum.
Talos handles CP joins automatically once their config is applied, but
expect a brief re-election. Verify with `talosctl etcd members` after.

## Common gotchas

- **`tf:*` aborts with `op-run: 1Password couldn't authorize`**: 1P is
  locked or the CLI prompt was dismissed/timed out. Unlock the desktop app
  (approve the prompt) and retry — the `tf/op-run.sh` guard appends this
  hint on purpose so terragrunt never runs with empty creds. Note the
  desktop integration grants short-lived auth windows: a multi-step
  session (apply, then outputs) may prompt more than once.
- **TF apply fails on machine_configuration_apply with TCP timeout**:
  the operator workstation has lost its VLAN-50 route (`ip route get
  10.50.0.10` falls through to the default gateway). Restore the subnet
  route (Step 3 / Pre-conditions) and retry.
- **`tofu apply` says "Error: dial tcp: connect: no route to host"**:
  VMs probably not up yet. Run Step 2 first, then re-run Step 3.
- **Bootstrap exits with context deadline exceeded after 10min**: cold
  start went over the timeout. Check node consoles for image pull
  stalls (`virsh console sietch-talos-cp1`); bump `timeouts.create` in
  `talos-bootstrap/main.tf` if necessary.
- **kubectl gets connection refused on VIP**: Talos VIP needs etcd up.
  Wait 30s post-bootstrap. If persistent: `talosctl --nodes 10.50.5.11
  service etcd` to inspect.

## Related

- `docs/operator-handoff.md` — manual `talosctl` recovery + troubleshooting.
- `docs/architecture.md` — failure-domain analysis, FQDN scheme.
- `docs/runbooks/smoke-plan.md` — single-host validation (smoke profile,
  bounded first pass, rollback paths).
