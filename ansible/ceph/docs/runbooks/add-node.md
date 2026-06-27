# Runbook: Add a Node to an Existing Cluster

**When:** Expanding cluster capacity or replacing a failed chassis.

**Time estimate:** 30-60 minutes (Austin physical), 15-30 minutes (Hetzner).

**Prerequisites:**
- Cluster is healthy (`ceph health` returns `HEALTH_OK` or understood warnings)
- `op` session live (desktop unlocked or `OP_SERVICE_ACCOUNT_TOKEN` set)
- SSH access to existing cluster nodes working

---

## 1. Declare the new host in TF

Pick an unused name, or omit `name` to let TF auto-pick from the
923-word list seeded per-cluster (see [docs/naming.md](../naming.md)).
Edit `tf/deployment/staging/austin/ceph/clusters.auto.tfvars` and append to the
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

Apply:

```bash
mise run tf:apply
```

This re-renders `inventory.ini` with the new host in `[ceph_nodes]`,
`[ceph_mon]`, and `[ceph_join]`. Bootstrap assignment doesn't change —
still pinned to the first/explicitly-declared bootstrap host. Add new
hosts at the **tail** of the list so existing auto-picked names keep
their positions.

## 2. Create host_vars

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

## 3. Confirm inventory regenerated correctly

After `tofu apply` in step 1, inspect the rendered inventory:

```bash
cat inventories/staging-austin/sietch/inventory.ini
```

The new host should appear in:
- `[ceph_nodes]` — all cluster members
- `[ceph_mon]` — MON/MGR placement
- `[ceph_join]` — everything except the bootstrap host

Bootstrap host is unchanged. TF never moves an existing bootstrap assignment.

## 4. Provision the OS

### Austin (physical servers)

1. Boot the server to the Debian 12 live image via iDRAC virtual console
2. Verify the live image is reachable on the node's bond IP
3. Run provisioning:

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

1. Boot into rescue mode via Hetzner Robot panel
2. SSH into rescue system as root
3. Run installimage for Debian 12 Bookworm
4. Run the post-install script to configure networking and partitioning
5. Reboot into installed OS
6. Verify SSH access

## 5. Run baseline

Installs podman, diagnostic tools, creates the ops user, renders /etc/hosts,
enables dbus/chrony/podman.socket:

```bash
scripts/ansible-play.sh baseline.yml --limit sietch-ceph-<name>
```

## 6. Apply tuning

OS-level sysctl, hardware I/O schedulers, CPU governor:

```bash
scripts/ansible-play.sh tune-os.yml --limit sietch-ceph-<name>
scripts/ansible-play.sh tune-hardware.yml --limit sietch-ceph-<name>
```

## 7. Join node to Ceph cluster

This runs all deploy phases. For an existing cluster, bootstrap is skipped
(ceph.conf already exists on the bootstrap node). The node gets joined,
LVM is set up, OSDs are created, and services are placed:

```bash
scripts/ansible-play.sh deploy-ceph.yml \
  --limit sietch-ceph-<name>,sietch-ceph-laurel
```

**Important:** You must include the bootstrap node (`sietch-ceph-laurel`)
in `--limit` because join, placement, OSD activation, and RGW service spec
updates all run from the bootstrap node.

## 8. Apply Ceph tuning and security hardening

```bash
scripts/ansible-play.sh tune-ceph.yml --limit sietch-ceph-laurel
scripts/ansible-play.sh harden.yml --limit sietch-ceph-<name>
```

## 9. Verify

### Check the node appears in the cluster

```bash
ssh ansible-iac@sietch-ceph-laurel

ceph orch host ls
```

Expected: new hostname listed with status empty (= online).

### Check OSDs are up

```bash
ceph osd tree
```

Expected: new node appears as a host bucket with its OSDs in `up` state.

### Check overall health

```bash
ceph status
```

Expected: `HEALTH_OK` or `HEALTH_WARN` with only backfill-related warnings
(which clear as data rebalances).

### Check RGW is running on new node

```bash
ceph orch ls --service-type rgw
```

Expected: running count incremented by 1.

### Run drift detection

```bash
mise run drift
```

Expected: no drift on the new node.

## Rollback

If the node needs to be removed:

```bash
# From bootstrap node
ceph orch host drain sietch-ceph-<name> --force
# Wait for daemons to migrate (~5 min)
ceph orch host rm sietch-ceph-<name> --force
```

Then remove the node from `inventory.ini` and delete its `host_vars` file.
