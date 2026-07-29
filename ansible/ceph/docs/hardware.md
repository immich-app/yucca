# Hardware Reference

Audience: Ops, procurement, capacity planning. Covers both live clusters:
**sietch** (staging, Austin, 3 nodes) and **spice** (production, Hetzner
FSN1-DC24, 48 nodes).

Per-node hardware facts live in
`ansible/ceph/inventories/<partition>-<region>/<cluster>/host_vars/` (bond_ip,
host_index, SAS path prefix, SSD PHY positions, HDD-to-block.db mappings) --
those files are committed and are authoritative for physical topology. On
spice the uniform parts moved up to `group_vars/all/vars.yml`; see the
host_vars schema section below.

For where this fits in the tool mesh, see [architecture.md](architecture.md);
for SSH targets, vaults, and per-cluster procedure differences, see
[cluster-profiles.md](cluster-profiles.md).

## Network topology

The two clusters differ here more than anywhere else. sietch is flat -- public
and cluster traffic share one subnet. spice splits them across VLANs on a
bonded 25G fabric. See [security-model.md](security-model.md) for the
threat-model implications of each.

| Cluster  | Networks                                                                                                          | Connection                                                                                     |
|----------|-------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| sietch   | public = cluster = `10.10.10.0/24`                                                                                | 2x 25GbE Mellanox ConnectX bonded active-backup (eno1np0 + eno2np1) per node; private switch    |
| spice    | public `10.40.20.0/23` (VLAN 120), cluster `10.40.22.0/23` (VLAN 122, MTU 9000), host-mgmt `10.40.24.0/24` (VLAN 124) | 2x 25GbE Intel E810 in an LACP bond to the leaf, VLAN sub-interfaces; plus a separate 1G WAN     |

On spice the 1G WAN (`enp197s0`, igb) stays on ifupdown exactly as installimage
configured it and holds the default route; only the bond and its VLANs are
networkd-managed (`networkd_replace_ifupdown: false`). That split is deliberate:
the WAN is the reachability link, so a networkd error on the fabric cannot cost
access to the node. Ansible connects over the WAN address; Ceph daemons never
bind it. Per-host fabric addresses are `10.40.2x.<host_index>`, derived in
`group_vars` rather than written out 48 times.

Jumbo frames are enabled on VLAN 122 only. That path is closed, homogeneous,
and entirely ours, so the packet/interrupt savings on replication and recovery
actually land. VLAN 120 carries RGW traffic to heterogeneous S3 clients and the
~1400-MTU NetBird overlay, where a jumbo mismatch is a partial blackhole (small
ops fine, large PUT/GET hang) for near-zero gain.

Per-node connection IPs (`bond_ip`) are declared in the cluster's
`tf/deployment/<partition>/<region>/ceph/clusters.auto.tfvars` and rendered by
TF into the cluster's `inventory.ini`. They're also mirrored into `host_vars/`
for use by roles that need the IP as a variable (e.g., cephadm public-network
resolution, dashboard URL construction).

## sietch -- Dell R730xd (Austin)

| Component | Spec |
|-----------|------|
| Chassis | Dell R730xd 12-bay LFF + 2 rear 2.5" bays |
| CPU | 2x Intel Xeon E5-2697A v4 (64 vCPUs) |
| RAM | 128 GB DDR4 |
| Boot SSDs | 2x Micron 5100 3.8TB (rear bays 12/13, mdraid-1) |
| HDD OSDs | 8-12x SAS 6TB (HGST HUS726060AL4210 / Seagate ST6000NKCLAR6000) |
| SSD OSDs | Partition 6 on each boot SSD (colocated, no separate block.db) |
| Block.db | 6x 240GB LVs per SSD (partition 5, LVM VG) |
| HBA | Broadcom/LSI SAS3008 IT mode (mpt3sas, no RAID) |
| Network | 2x 25GbE Mellanox ConnectX bonded active-backup (eno1np0 + eno2np1) |
| Boot | UEFI, dual ESP (one per SSD, rsync-mirrored) |
| OS | Debian 12 Bookworm (debootstrap provisioned) |
| Provisioning | Live image -> `provision.yml` -> debootstrap |

### SSD partition layout (per SSD)

| Partition | Size | Use |
|-----------|------|-----|
| 1 | 512 MB | ESP (FAT32, UEFI boot) |
| 2 | 1 GB | /boot (mdraid-1, ext4, metadata 1.0) |
| 3 | 80 GB | / (mdraid-1, ext4) |
| 4 | 8 GB | swap (mdraid-1) |
| 5 | ~1.4 TB | Ceph block.db LVs (LVM VG) |
| 6 | ~2 TB | SSD OSD data (ceph-volume) |

## spice -- Hetzner SX295 (FSN1-DC24, Falkenstein)

48 nodes, 15 OSDs each: 720 OSDs total (672 HDD + 48 NVMe-backed). That is an
OSD count, not a disk count -- the physical disks are 672 HDD + 96 NVMe = 768.
Confusing the two badly overstates spindle count.

| Component | Spec |
|-----------|------|
| Chassis | Hetzner SX295, 48 nodes across 4 racks in FSN1-DC24 |
| HDD OSDs | 14x 22TB SATA per node, on 3 AHCI controllers (`pci-0000:45:00.0` x8, `:46:00.0` x2, `:87:00.0` x4), addressed by-path |
| Boot NVMe | 2x 7.68TB NVMe in mdraid-1 -> `vg0` (`nvme0n1` + `nvme1n1`) |
| vg0 OS LVs | swap 32G, `/` 100G, `/var` 200G, `/var/log` 50G; `/boot` is a 1G ext4 partition outside the VG |
| Block.db | 14x 128G `db-slotN` LVs on `vg0` |
| SSD OSD | one `ssd-osd` LV, `vg0` free minus a 512 GiB reserve |
| Network | 2x 25GbE Intel E810 (`enp193s0f0/f1`, ice) in an LACP bond; 1G WAN `enp197s0` (igb) |
| Boot | BIOS (`reprovision_boot_mode: bios`), grub |
| OS | Debian 12 Bookworm (Hetzner installimage) |
| Provisioning | Rescue mode -> `installimage -a -c /autosetup -x post-install.sh` (`reprovision_hetzner` role) |
| Remote hands | No IPMI, one KVM for 48 nodes -- physical work is a Hetzner ticket, and drives are identified by **serial**, not bay |

installimage builds the mdraid-1, `vg0`, and the OS LVs. It does not create the
`db-slot` or `ssd-osd` LVs: those are carved at converge by
`ceph_deploy/lvm-setup.yml`'s NVMe-RAID branch. The `-x post-install.sh` chroot
step is deliberately limited to seeding root and `ansible-iac` SSH keys -- no
apt, no `lvcreate` -- because those are the steps that broke installimage on
the SX295 precedent.

> **Why Bookworm and not Trixie:** upstream Ceph Tentacle's Debian
> repository at `download.ceph.com/debian-tentacle/dists/` publishes only
> for `bookworm`, `jammy`, and `noble`. Trixie is not yet supported. The
> autosetup `IMAGE` line MUST select a Bookworm tarball until upstream
> ships Trixie packages.

The E810 needs the `firmware-misc-nonfree` DDP package. Without it the NIC boots
into Safe Mode, whose crippled classifier drops LACP and LLDP control frames, so
the bond never aggregates. `baseline` installs it and reboots once to load it.

## host_vars schema by hardware shape

Storage topologies differ across hardware shapes, and so does the
`host_vars/<host>.yml` schema. When adding a new cluster, pick the schema
that matches the hardware -- don't copy an existing cluster's. sietch uses the
first schema, spice the second.

### sietch-shape (SAS expander + dual-SSD-VG)

```yaml
hostname_short: <cluster>-ceph-<name>
bond_ip: 10.10.X.Y
sas_path_prefix: "pci-XXXX:XX:XX.X-sas-exp0xXXXX..."  # REQUIRED -- disambiguates SAS topology
ssd1_phy: 12        # PHY slot of boot SSD #1
ssd2_phy: 13        # PHY slot of boot SSD #2
ceph_db_vg1: ceph-db-rear12   # VG on SSD1 partition 5
ceph_db_vg2: ceph-db-rear13   # VG on SSD2 partition 5
ceph_db_lvs_per_ssd: 6        # 6 db-slot LVs per VG -> 12 total
ceph_hdd_osds:
  - { path_phy: phy0, db: ceph-db-rear12/db-slot0 }
  - ...
ceph_ssd_osds:                # SSD OSD = partition 6 of each boot SSD
  - { path_phy: phy12, partition: 6 }
  - { path_phy: phy13, partition: 6 }
```

The role composes full disk paths as
`/dev/disk/by-path/<sas_path_prefix>-<path_phy>-lun-0` (HDDs) or with
`-part<N>` suffix (SSD partitions). `roles/ceph_deploy/tasks/lvm-setup.yml`
runs this shape's VG/LV recovery path.

### NVMe-RAID shape (single VG + LV-backed SSD OSD)

```yaml
hostname_short: <cluster>-ceph-<name>
bond_ip: <public IP>
ceph_db_vg: vg0                          # single VG on NVMe RAID-1 (no sas_path_prefix)
ceph_db_lvs_per_node: 14                 # all db-slot LVs on the one VG
ceph_hdd_osds:
  - { path_phy: pci-XXXX:XX:XX.X-ata-1, db: vg0/db-slot0 }   # full PCI-ATA path
  - ...
ceph_ssd_osds:
  - { lv: vg0/ssd-osd }                  # SSD OSD = LV on same VG
```

The role uses `path_phy` directly as the by-path identifier (no composition
needed -- operator authors the full string). For SSD OSDs, `lv` field is
used (`/dev/<lv>`) instead of `path_phy + partition`.

`lvm-setup.yml` branches rather than skipping: `sas_path_prefix is undefined`
selects the NVMe-RAID path, which asserts `vg0` exists (installimage made it)
and then creates the `db-slotN` LVs plus the `ssd-osd` LV from the remainder
minus `ceph_ssd_osd_reserve_gib`. It never shrinks an existing LV -- truncating
a live block.db corrupts the OSD.

On spice these keys live in `group_vars` rather than in 48 host_vars files,
because the by-path map is identical on 47 of the 48 nodes;
`spice-ceph-miguel` overrides `ceph_hdd_osds` in its own host_vars (one HDD on
a different AHCI controller). The per-node files carry only `bond_ip`,
`host_index`, `hetzner_server_number`, and the `mon` flag. Prefer that split
whenever a fleet is uniform: 48 near-identical files would have buried the
one-node exception.

The `{path_phy, db}` pairing is presentational either way. A cephadm OSD spec
has no per-disk block.db field, so the template emits two independent path
arrays and ceph-volume pairs them in its own order. Resolve a real pairing with
`cephadm ceph-volume lvm list`, never from the inventory.

### Decision rule for new clusters

- **Has a SAS expander** (PERC HBA, mpt3sas, etc.) and **dedicated boot SSDs
  partitioned for both block.db and OS** -> sietch-shape.
- **Single VG covering boot + block.db + SSD OSD** (typical for
  hosting-provider servers with NVMe RAID-1) -> NVMe-RAID shape.
- **Other shapes** (e.g., dedicated NVMe block.db drives) require a new
  shape branch in the cephadm OSD service-spec template
  (`roles/ceph_deploy/templates/osd-spec.yml.j2`). Hardware-shape branching
  lives in that template's Jinja conditional, not in role logic -- a new
  shape adds a branch there plus its own host_vars, and the rest of the
  role is untouched.
