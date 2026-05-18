# Runbook: Replace a Failed HDD

**When:** SMART failure, unresponsive OSD, or predictive disk replacement.

**Time estimate:** 15-30 minutes (plus backfill time, which varies by data volume).

**Prerequisites:**
- Physical or remote hands access for the disk swap
- Cluster has enough free capacity to absorb the missing OSD during backfill

---

## 1. Identify the failed disk

### Check cluster health

```bash
ceph health detail
```

Look for messages like:
- `OSD_DOWN` -- `1 osds down`
- `DEVICE_HEALTH_TOOMANY` -- `1 device(s) expected to fail soon`
- `PG_DEGRADED` -- degraded placement groups

### Find the OSD ID and host

```bash
ceph osd tree
```

Note the OSD ID (e.g., `osd.7`) and the host it belongs to.

### Check SMART data

SSH to the host and find the physical device:

```bash
# Find the device backing the OSD
ceph-volume lvm list | grep -A5 "osd.7"

# Or find by path
ceph device ls | grep osd.7

# Check SMART
smartctl -a /dev/sdX
```

Look for: `Reallocated_Sector_Ct`, `Current_Pending_Sector`,
`SMART overall-health self-assessment test result: FAILED`.

## 2. Mark OSD out (start draining)

```bash
ceph osd out osd.7
```

This begins backfilling data away from the OSD. Monitor progress:

```bash
ceph -s
# or watch:
ceph -w
```

Wait until backfill completes and all PGs are `active+clean`:

```bash
ceph pg stat
```

Expected output includes `active+clean` for all PGs, zero `remapped` or
`backfilling`.

**Do not proceed until backfill is complete.** Pulling a disk during
backfill risks data loss if another disk fails simultaneously.

## 3. Stop and purge the OSD

```bash
# Stop the OSD daemon
ceph orch daemon stop osd.7

# Purge OSD from cluster (removes from CRUSH, auth keys, etc.)
ceph osd purge osd.7 --yes-i-really-mean-it
```

Verify removal:

```bash
ceph osd tree
```

The OSD should no longer appear.

## 4. Close LUKS and clean up on the host

SSH to the host where the OSD lived:

```bash
ssh ansible-iac@sietch-ceph-<host>
sudo -i
```

### Close the LUKS mapping

```bash
# List dm-crypt mappings to find the right one
dmsetup ls --target crypt

# Close it (name will be something like ceph-<uuid>-...-block-dmcrypt)
cryptsetup close <mapping-name>
```

### Remove LVM artifacts

```bash
# Find and remove orphaned PV on the disk
pvs | grep /dev/sdX
pvremove -f /dev/sdX
```

### Wipe device signatures

```bash
wipefs -af /dev/sdX
dd if=/dev/zero of=/dev/sdX bs=1M count=10
```

## 5. Physical disk swap

### Austin (on-site)

1. Identify the bay number from the SAS PHY mapping in host_vars
2. The disk bay maps to a by-path device: `/dev/disk/by-path/<sas_path_prefix>-phy<N>-lun-0`
3. Turn on the drive bay LED if available via iDRAC / `ledctl`
4. Coordinate with the remote hands team for the physical swap
5. Hot-swap the drive -- these are SAS/SATA hot-plug bays
6. Verify the new disk appears:

```bash
lsblk
ls /dev/disk/by-path/ | grep phy<N>
```

### Hetzner (remote)

Requires a support ticket to Hetzner for disk replacement. Schedule
maintenance window.

## 6. Re-create the OSD

The new disk must get an encrypted OSD with a block.db LV on the SSD,
matching the original configuration.

### Verify the block.db LV still exists

```bash
lvs | grep db-slot<N>
```

If the LV was destroyed, re-run LVM setup first:

```bash
scripts/ansible-play.sh deploy-ceph.yml \
  --tags lvm --limit sietch-ceph-<host>,sietch-ceph-laurel
```

### Create the OSD manually

```bash
# Ensure bootstrap-osd keyring is present
ceph auth get client.bootstrap-osd -o /var/lib/ceph/bootstrap-osd/ceph.keyring

# Create encrypted OSD with block.db
DISK="/dev/disk/by-path/<sas_path_prefix>-phy<N>-lun-0"
DB_LV="<vg-name>/db-slot<N>"

cephadm ceph-volume \
  --keyring /var/lib/ceph/bootstrap-osd/ceph.keyring \
  lvm create --dmcrypt --no-systemd \
  --data "$DISK" --block.db "$DB_LV"
```

### Activate the OSD

From the bootstrap node:

```bash
ceph cephadm osd activate <hostname>
```

### Or re-run via Ansible

Alternatively, re-run the OSD creation phase through Ansible (idempotent --
skips existing OSDs):

```bash
scripts/ansible-play.sh deploy-ceph.yml \
  --tags osds --limit sietch-ceph-<host>,sietch-ceph-laurel
```

## 7. Verify

### Check the new OSD is up

```bash
ceph osd tree
```

Expected: new OSD appears under the correct host with status `up` and
weight > 0.

### Check reweight

```bash
# If reweight is 0, fix it
ceph osd tree | grep "osd.<new-id>"

# If needed:
ceph osd reweight <new-id> 1.0
```

### Monitor backfill to the new OSD

```bash
ceph -s
```

Wait for `active+clean` on all PGs.

### Verify dmcrypt

```bash
ceph config-key dump | grep dm-crypt | wc -l
```

Should show one more key than before the replacement.

### Verify SMART on new disk

```bash
smartctl -a /dev/sdX
```

Confirm the new disk has zero errors.
