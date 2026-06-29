# Hardware Reference

Audience: Ops, procurement, capacity planning. Per-node hardware facts that
differ across clusters live in
`ansible/ceph/inventories/<partition>-<region>/<cluster>/host_vars/`
(bond_ip, SAS path prefix, SSD PHY positions, HDD-to-block.db mappings) --
those files are committed and are authoritative for physical topology.

For where this fits in the tool mesh, see [architecture.md](architecture.md).

## Network topology

Clusters use a **single-network** design today -- public and cluster
traffic share one subnet. Production will separate them; see
[security-model.md](security-model.md) for the threat-model implications.

| Cluster  | Subnet            | Connection                                                             |
|----------|-------------------|------------------------------------------------------------------------|
| sietch   | `10.10.10.0/24`   | 2x 10GbE bonded active-backup (eno1 + eno2) per node; private switch   |

A Hetzner NVMe-RAID host would attach over a public /32 with a single NIC
and direct SSH (no bond, no ProxyJump).

Per-node connection IPs (`bond_ip`) are declared in
`tf/deployment/staging/austin/ceph/clusters.auto.tfvars` and rendered by TF into the
cluster's `inventory.ini`. They're also mirrored into `host_vars/` for use
by roles that need the IP as a variable (e.g., cephadm public-network
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
| Network | 2x 10GbE bonded active-backup (eno1 + eno2) |
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

## Hetzner NVMe-RAID shape (e.g. SX295)

The roles also support a Hetzner-style single-box shape for future
hosting-provider clusters: NVMe boot drives in installimage RAID-1
(`vg0`), HDD OSDs over onboard SATA with per-HDD block.db LVs on the NVMe
VG, and a single LV-backed SSD OSD carved from the NVMe remainder.
Provisioning is rescue mode -> `installimage/autosetup` + `post-install.sh`,
booting Debian 12 Bookworm.

> **Why Bookworm and not Trixie:** upstream Ceph Tentacle's Debian
> repository at `download.ceph.com/debian-tentacle/dists/` publishes only
> for `bookworm`, `jammy`, and `noble`. Trixie is not yet supported. The
> autosetup `IMAGE` line MUST select a Bookworm tarball until upstream
> ships Trixie packages.

## host_vars schema by hardware shape

Storage topologies differ across hardware shapes, which shows up in the
`host_vars/<host>.yml` schema. When adding a new cluster, operators must
pick the schema matching the hardware -- not just copy from an existing
cluster blindly.

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
used (`/dev/<lv>`) instead of `path_phy + partition`. `lvm-setup.yml` is
**skipped** on this shape (gated `when: sas_path_prefix is defined`) --
LVM is owned by the Hetzner installimage post-install script.

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
