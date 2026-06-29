# Runbook: Add a Node to an Existing Cluster

**When:** Expanding cluster capacity or replacing a failed chassis.

**Time estimate:** 30-60 minutes (Austin physical), 15-30 minutes (Hetzner).

**Prerequisites:**
- Cluster is healthy (`ceph health` returns `HEALTH_OK` or understood warnings)
- `op` session live (desktop unlocked or `OP_SERVICE_ACCOUNT_TOKEN` set) for the
  manual provisioning step
- SSH access to existing cluster nodes working

---

## What you do vs what CI does

CI (`.github/workflows/infra.yml`) owns the apply + convergence: on merge to
main it applies the ceph TF stack (renders the inventory, mints RGW keys) and
runs the full Ansible pipeline (baseline -> tune -> deploy -> harden) against
the cluster over the NetBird overlay. CI cannot boot a server to a live image,
so the **physical provisioning is the manual part**.

The flow is therefore: open a PR with the TF + host_vars changes, physically
provision the box, then merge -- CI converges it.

## 1. Declare the new host in TF (PR)

Pick an unused name, or omit `name` to let TF auto-pick from the 923-word list
seeded per-cluster (see [docs/naming.md](../naming.md)). Edit
`tf/deployment/staging/austin/ceph/clusters.auto.tfvars` and append to the
target cluster's `hosts` list:

```hcl
sietch = {
  # ...
  hosts = [
    { name = "laurel", bond_ip = "10.10.10.90", bootstrap = true },
    { name = "lawson", bond_ip = "10.10.10.91" },
    { name = "samara", bond_ip = "10.10.10.92" },
    { name = "maxton", bond_ip = "10.10.10.93" },   # NEW
  ]
}
```

Add new hosts at the **tail** of the list so existing auto-picked names keep
their positions. Bootstrap assignment never moves -- it stays pinned to the
first/explicitly-declared bootstrap host.

## 2. Create host_vars (PR)

```bash
cd inventories/staging-austin/sietch
cp host_vars/example.yml host_vars/sietch-ceph-<name>.yml
```

Edit the new file. Every field is node-specific and must match the physical
hardware:

| Field | How to find it |
|---|---|
| `hostname_short` | The full `sietch-ceph-<name>` from step 1 |
| `bond_ip` | Next available IP in 10.10.10.0/24. Austin convention: yucca-N = 10.10.10.9N |
| `sas_path_prefix` | SSH into node, run `ls /dev/disk/by-path/ \| grep sas` |
| `ssd1_phy` / `ssd2_phy` | Identify SSD PHY positions from `lsscsi -t` output |
| `ceph_db_vg1/2` | Name the VGs by slot, e.g., `ceph-db-rear12`, `ceph-db-rear13` |
| `ceph_hdd_osds` | Map each populated HDD bay to its PHY and corresponding db-slot LV |
| `ceph_ssd_osds` | SSD partition 6 on each SSD (no separate block.db) |

`host_vars` is committed -- it rides the same PR as the tfvars change.

## 3. Provision the OS (manual -- CI can't do this)

This is the step that needs a human: it boots the box to a live image, which
CI cannot do. Get the node provisioned and reachable on its bond IP before
merging, so CI's convergence can SSH it over the NetBird overlay.

### Austin (physical servers)

1. Boot the server to the Debian 12 live image via the iDRAC virtual console.
2. Verify the live image is reachable on the node's bond IP.
3. Run provisioning (from your workstation):

```bash
CEPH_ENV=inventories/staging-austin/sietch/inventory-provision.ini \
  scripts/ansible-play.sh provision.yml \
  -e confirm_wipe=true \
  --limit sietch-ceph-<name>
```

4. Wait for reboot and verify SSH access as `ansible-iac`:

```bash
ssh -i ~/.ssh/id_ed25519_sietch ansible-iac@sietch-ceph-<name> hostname -f
```

Expected output: `sietch-ceph-<name>.staging.austin.int.futo.cloud`

### Hetzner (remote servers)

1. Boot into rescue mode via the Hetzner Robot panel.
2. SSH into the rescue system as root.
3. Run installimage for Debian 12 Bookworm.
4. Run the post-install script to configure networking and partitioning.
5. Reboot into the installed OS.
6. Verify SSH access.

## 4. Merge the PR -- CI converges the node

Merge to main. `infra.yml` applies the ceph stack and runs the full pipeline
(baseline -> tune-os -> tune-hardware -> deploy-ceph -> tune-ceph -> harden)
against the cluster, which joins the new host, sets up its LVM, creates its
OSDs, and places services. Watch the `Apply staging@austin/ceph` job; the
apply is gated behind the `staging-austin` environment's required reviewers.

### Manual fallback (CI unavailable, or converging one node out-of-band)

The same convergence by hand, scoped to the new node plus the bootstrap host
(join/placement/OSD activation all run from bootstrap):

```bash
scripts/ansible-play.sh baseline.yml        --limit sietch-ceph-<name>
scripts/ansible-play.sh tune-os.yml         --limit sietch-ceph-<name>
scripts/ansible-play.sh tune-hardware.yml   --limit sietch-ceph-<name>
scripts/ansible-play.sh deploy-ceph.yml     --limit sietch-ceph-<name>,sietch-ceph-laurel
scripts/ansible-play.sh tune-ceph.yml       --limit sietch-ceph-laurel
scripts/ansible-play.sh harden.yml          --limit sietch-ceph-<name>
```

## 5. Verify

Check the CI job logs, or from the bootstrap node:

```bash
ssh ansible-iac@sietch-ceph-laurel

ceph orch host ls                  # new host listed, status blank (meaning online)
ceph osd tree                      # new host bucket, OSDs up
ceph status                        # HEALTH_OK, or HEALTH_WARN with only backfill warnings
ceph orch ls --service-type rgw    # running count incremented by 1
```

Then `mise run drift` should report no drift on the new node.

## Rollback

If the node needs to be removed:

```bash
# From the bootstrap node
ceph orch host drain sietch-ceph-<name> --force
# Wait for daemons to migrate (~5 min)
ceph orch host rm sietch-ceph-<name> --force
```

Then drop the host from `clusters.auto.tfvars`, delete its `host_vars` file,
and merge -- CI re-renders the inventory without it.
