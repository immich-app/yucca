# Runbook: Replace a Failed HDD

**When:** SMART failure, unresponsive OSD, or predictive disk replacement.

**Time estimate:** 15-30 minutes (plus backfill time, which varies by data volume).

**Prerequisites:**
- Physical or remote hands access for the disk swap
- Cluster has enough free capacity to absorb the missing OSD during backfill

> **Which cluster?** Sections 1-7 below describe the **sietch** shape: SAS
> expander bays (`sas_path_prefix`), dual-SSD block.db VGs, on-site hands in
> Austin, `ansible-iac` SSH. **Spice is a different shape** and several steps do
> not apply to it. For spice, use section 1 to identify the disk, then jump to
> [Spice (Hetzner SX295)](#spice-hetzner-sx295) instead of sections 2-7.

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

This works on sietch because its OSD specs are managed, so cephadm acts on the
re-applied spec. It does **not** carry over to spice, whose specs are
deliberately unmanaged -- see the spice section below.

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

---

## Spice (Hetzner SX295)

Spice nodes are the NVMe-RAID shape: 14x SATA HDD on 3 AHCI controllers, plus
2x NVMe in RAID-1 (`md1`) carrying `vg0`, which holds the OS, 14x 128G
`db-slotN` LVs, and the `ssd-osd` LV. There is no SAS expander, no
`sas_path_prefix`, and no IPMI. SSH is `root` with `~/.ssh/id_ed25519_spice`.

Two differences drive the whole procedure:

- **block.db survives the swap.** The db slot is an LV on `vg0` (NVMe), not on
  the HDD. Replacing the disk does not touch it, so it keeps the dead OSD's
  metadata and must be zapped before reuse. Nothing in sections 4-6 covers this.
- **The disk/slot pairing is not what the inventory implies.** `ceph_hdd_osds`
  groups `{path_phy, db}` per row, but a cephadm OSD spec has no per-disk
  block.db syntax, so those become two independent path arrays and ceph-volume
  pairs them in its own order. Resolve the real pairing from the live host, and
  never assume the slot written next to a disk in group_vars.

### 1. Resolve the OSD, disk, bay, and db slot

```bash
# db slot and kernel device, from the host
cephadm ceph-volume lvm list | grep -A 8 "====== osd.<id>"

# bay: the by-path is what the replacement disk will inherit
ls -l /dev/disk/by-path/ | grep <sdX>$

# serial, for the Hetzner ticket
smartctl -i /dev/<sdX> | grep -i "serial number"
```

Record all four. The by-path identifies the bay; the serial identifies the disk
to Hetzner; the db slot is what you zap and reuse.

**When the disk has already dropped off the bus**, which is the common shape of a
hard failure, both commands above fail: there is no `/dev/sdX` and the by-path
symlink disappeared with the disk. Recover them from the cluster instead.

```bash
# serial: the mgr keeps its device inventory after the disk is gone
ceph device ls-by-daemon osd.<id>

# bay: every spice node has the same 14, so the missing one is the empty bay
ls /dev/disk/by-path/ | grep -E 'ata-[0-9]+$' | sort -V
```

The full complement is `pci-0000:45:00.0-ata-{1..8}`, `pci-0000:46:00.0-ata-{1,2}`
and `pci-0000:87:00.0-ata-{1..4}`. Diff against a healthy peer if it is easier to
read that way.

### 2. Drain

```bash
ceph osd out <id>
```

Watch until it holds no PGs. `osd df` reports `SIZE 0 B` for an out OSD, so the
`PGS` column is the one to track:

```bash
ceph osd df | awk 'NR==1 || $1==<id>'
```

Do not proceed until it reaches 0 and the cluster is `active+clean`.

Draining is safe even when the disk has unreadable sectors: for EC pools Ceph
reconstructs any shard the failing disk cannot hand over from the surviving
shards.

### 3. Clear stale scrub errors

If the disk caused scrub errors, the `inconsistent` flag and the scrub-error
count are sticky. They survive the drain even though the damage is gone,
because only a scrub clears them:

```bash
for pg in <pgids>; do ceph pg deep-scrub $pg; done
```

Do not `ceph pg repair` a failing disk. Repair rebuilds the bad shard and writes
it back to the same drive; draining relocates it to a healthy one.

### 4. Remove the OSD and free the db slot

```bash
ceph orch daemon stop osd.<id>
ceph orch osd rm <id> --replace     # keeps the id reserved for the new disk
ceph osd tree destroyed             # must list <id> before step 6 can reuse it
```

`--replace` marks the id `destroyed` instead of purging it, and `destroyed` is
the only osdmap state ceph-volume will reuse an id from. An OSD that is merely
`down` and `out` still owns its number, so skipping this step and rebuilding
anyway hands the new disk the next free id above every existing OSD.

If `orch osd rm` stalls on a daemon that is already dead, do the same thing by
hand: `ceph osd destroy <id> --yes-i-really-mean-it`, then
`ceph orch daemon rm osd.<id> --force`.

Leave the db LV alone. `replace-osd.yml` zaps it in step 6, and it zaps
unconditionally so it does not matter whether the slot survived, was already
zapped, or was deleted outright by an earlier ad-hoc removal.

Do **not** `lvremove` the slot. Deleting it rather than zapping it is what
happened to osd.35 on alyssa, and while the play now recreates a missing slot,
the deletion buys nothing and loses the record of which slot belonged to the OSD.

### 5. Physical swap

Hetzner support ticket quoting the **serial** from step 1, since there is no
IPMI and no bay LED. Reference the by-path only as supporting detail; Hetzner
identifies drives by serial.

Ask for a hot swap. The Robot form carries a `Replacement method` field, and
these bays do support `hot_swap`: Hetzner replaced a drive on a live SX295 with
no downtime. A single-disk swap then needs no maintenance window at all, as long
as the OSD is already `down` and `out` so nothing is reading the device.

Take the host into maintenance only when the work genuinely needs the machine
down, which so far means anything inside the chassis, such as reseating a SATA
cable. Skipping it in that case leaves the remaining OSDs to be marked `out` ten
minutes in, and the cluster starts a rebalance that has to be undone when the
host returns: [host-maintenance.md](host-maintenance.md).

After the swap, confirm the new disk is present at the same by-path:

```bash
ls -l /dev/disk/by-path/ | grep <bay-path>
smartctl -i /dev/disk/by-path/<bay-path> | grep -i "serial number"
```

The serial must differ from the one you sent. Same serial means the disk was
not actually swapped.

### 6. Recreate the OSD

Run `replace-osd.yml`. It takes the bay and derives the rest:

```bash
scripts/ansible-play.sh replace-osd.yml --limit <hostname> \
  -e osd_bay=<bay-path> -e osd_id=<id>
```

It ensures the db slot LV exists, zaps it, drives `ceph-volume lvm create` with
the slot and the id pinned explicitly, activates the daemon, and then asserts
the result landed on the NVMe under the id you asked for. Re-running it against
a bay that already holds an OSD is a no-op, so it is safe to repeat after a
failure.

`osd_id` is optional. Leave it off only when you want a fresh number, which on
a full osdmap is one above every OSD in the cluster. With it set, the play
refuses to run until step 4 has marked that id `destroyed`.

A hot swap on a host that has not rebooted leaves the dead OSD's dm-crypt
mapping open on the db slot (`lvs` shows the LV as `-wi-ao----`, `lsblk` shows a
`crypt` child under it). That is normal and needs no hand cleanup: `ceph-volume
lvm zap` closes the mapping itself, by the LV uuid it is named after. The play
only checks first that nothing still holds it open, since a zap under a live
holder would wipe a block.db in use.

The slot is derived, not passed: a slot counts as claimed only when it is the
`db` entry of an OSD that also has a `block` entry. That distinction matters
because a db-slot whose data disk died keeps its `ceph.osd_id` tag and reads as
claimed forever if you go by LV tags alone. Pass `-e osd_db_slot=<n>` if the play
reports more than one candidate.

The equivalent by hand, for when you need to see what it is doing:

```bash
DISK=/dev/disk/by-path/<bay-path>
DB_LV=vg0/db-slot<N>

# These nodes carry no /etc/ceph and no bootstrap-osd keyring: cephadm hands the
# mgr-supplied credentials to the container at deploy time and leaves nothing
# behind. Stage both, from the bootstrap node, for the one command.
install -d -m 0700 /run/replace-osd
ssh <bootstrap> ceph config generate-minimal-conf > /run/replace-osd/ceph.conf
ssh <bootstrap> ceph auth get client.bootstrap-osd > /run/replace-osd/bootstrap-osd.keyring
chmod 600 /run/replace-osd/*

cephadm ceph-volume \
  --config /run/replace-osd/ceph.conf \
  --keyring /run/replace-osd/bootstrap-osd.keyring \
  lvm create --dmcrypt --no-systemd --crush-device-class hdd \
  --osd-id <id> --data "$DISK" --block.db "$DB_LV"

rm -rf /run/replace-osd
ceph cephadm osd activate <hostname>
```

Two traps in that block, both of which cost a failed run:

- **The ceph.conf must end in a newline.** Without it `conf_read_file` throws
  `InvalidArgumentError('RADOS invalid argument')` and ceph-volume then reports
  `RuntimeError: Unable to create a new OSD id`, which reads like a credentials
  problem and is not. Shell redirection preserves the newline; anything that
  captures the output as a string is liable to strip it.
- **Pass `--crush-device-class` explicitly.** Ceph infers `hdd` from rotational
  if you omit it, so the OSD comes up in the right class either way, but its LV
  tag is then left empty while every OSD built from the drivegroup spec carries
  the class. Inference is not declarative; set it.

**Do not rebuild a replaced disk by re-managing the OSD spec.** spice's specs
carry `unmanaged: true` (`ceph_osd_spec_unmanaged` in its group_vars) precisely
so cephadm cannot act on a blank disk on its own, and `ceph orch set-managed`
undoes that. Upstream [tracker #68436][t68436] is this exact sequence: with the
spec managed after a hardware swap the drivegroup preview fails, and cephadm
recreates the OSD **without the BlueStore db setup**. On spice that is a silent
downgrade -- block.db lands colocated on the 22TB HDD instead of the `vg0`
db-slot LV, and the OSD comes up healthy-looking with the write latency of a
spinning disk in front of every metadata operation. The bug is open against
18.2.4 and the cluster runs 20.2.2.

The same applies to `deploy-ceph.yml --tags osds`. It re-renders and re-applies
the spec, which stays unmanaged, so it will not create the OSD for you; the
`ceph_osd_allow_spec_provisioning` window that would let it is for initial
cluster provisioning only. Use `replace-osd.yml` above.

[t68436]: https://tracker.ceph.com/issues/68436

### 7. Verify

`replace-osd.yml` already asserts the part that is invisible from the outside:
that `bluefs_dedicated_db` is 1 and the db is non-rotational. A colocated
block.db does not show up in `ceph -s` or `ceph osd tree`, so if you built the
OSD by hand, check it yourself:

```bash
ceph osd metadata <id> -f json | \
  python3 -c 'import sys,json; d=json.load(sys.stdin); \
    print(d["bluefs_dedicated_db"], d["bluefs_db_devices"], d["bluefs_db_rotational"])'
# expect: 1 md1 0
```

Then watch it fill:

```bash
ceph osd tree | grep "osd.<id>"        # up, weight > 0
ceph osd df | awk 'NR==1 || $1==<id>'  # PGs climbing as backfill lands
ceph -s                                # back to active+clean
```

Confirm it took the intended slot and matches its siblings:

```bash
cephadm ceph-volume lvm list | grep -A 8 "====== osd.<id>"
lvs -a -o lv_tags | grep "ceph.osd_id=<id>," | grep -o 'ceph.crush_device_class=[a-z]*'
```
