# Cluster Profiles

The runbooks are written against placeholders rather than one cluster's
hostnames, because the two live Ceph clusters differ in access, layout, and
hardware. Resolve the placeholders here before running anything.

Most of these facts come from the cluster's `clusters.auto.tfvars` entry and its
`group_vars/all/vars.yml`; those files are authoritative if this table ever
drifts from them.

## Placeholders used in runbooks

| Placeholder | Meaning |
|---|---|
| `<ssh-target>` | `<ssh user>@<bootstrap host>` for the cluster |
| `<inventory>` | Inventory directory, relative to `ansible/ceph/` |
| `<vault>` | 1Password vault holding the cluster's secrets |
| `<rgw-dns>` | Canonical S3 / RGW DNS name |

## The clusters

| | **sietch** | **spice** |
|---|---|---|
| Partition@region | `staging@austin` | `prod@htz-fsn1` |
| Bootstrap host | `sietch-ceph-laurel` | `spice-ceph-adelia` |
| SSH user | `ansible-iac` | `root` |
| SSH key | `~/.ssh/id_ed25519_sietch` | `~/.ssh/id_ed25519_spice` |
| `<ssh-target>` | `ansible-iac@sietch-ceph-laurel` | `root@spice-ceph-adelia` |
| `<inventory>` | `inventories/staging-austin/sietch` | `inventories/prod-htz-fsn1/spice` |
| `<vault>` | `yucca_tf_staging` | `yucca_tf_prod` |
| `<rgw-dns>` | `s3.staging.austin.int.futo.cloud` | `s3.prod.fsn1.htz.futo.cloud` |
| Nodes | 3 | 48 |
| Cert subject | `US` / `Texas` / `Austin` | `DE` / `Saxony` / `Falkenstein` |

## Shape differences that change procedures

These are the places where a runbook needs a genuinely different sequence, not
just different values substituted in.

**Disk layout.** sietch nodes sit behind a SAS expander: every disk path is
`/dev/disk/by-path/<sas_path_prefix>-phy<N>-lun-0`, and block.db lives on a
dual-SSD VG. spice nodes are SX295: 14 SATA HDDs across 3 AHCI controllers
addressed as `/dev/disk/by-path/pci-<addr>-ata-<n>`, with block.db on 128G
`db-slotN` LVs carved from the NVMe RAID-1 `vg0`. `sas_path_prefix` is undefined
on spice, and templates branch on that.

**Hands.** sietch is on-site in Austin with iDRAC, virtual console, and bay LEDs
for identifying a drive. spice has no IPMI and one KVM for 48 nodes; physical
work is a Hetzner support ticket, and drives are identified to Hetzner by
**serial**, not by bay.

**Provisioning.** sietch provisions from a Debian live image booted over the
iDRAC virtual console. spice uses Hetzner rescue mode plus installimage, driven
by the `reprovision_hetzner` role.

**Blast radius.** sietch is 3 nodes in staging. spice is 48 nodes serving
production, so `serial:` batching and health gates matter there in a way they do
not in Austin. Sequence spice work per node unless you have a reason not to.

## Inventory files

sietch's `inventory.ini` is rendered by Terraform (`ceph-cluster` module,
`rendered_files` output) and is not committed; only `group_vars/` and
`host_vars/` are in the repo. Render it before running a playbook against
sietch:

```bash
ansible/ceph/scripts/render-inventories.sh staging austin
```

The script is read-only against state, but it reads the stack's `render`
output, so a `terragrunt apply` must have run for that output to reflect the
current cluster spec. spice's `inventory.ini` is committed; the same script
renders it with `prod htz-fsn1`.
