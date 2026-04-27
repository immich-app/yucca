# ADR-002: Explicit OSD-to-Disk Mapping in host_vars

## Status

Accepted

## Context

Ceph can auto-discover available drives via `ceph orch apply osd --all-available-devices`.
This is convenient but dangerous in a mixed-media cluster with complex disk
layouts. Our Austin nodes have:

- 12 front-bay HDDs assigned to OSD data, each needing a specific block.db LV
  on one of two rear-bay SSDs.
- 2 rear-bay SSDs that are multi-purpose: partition 1-4 for OS (mdraid+LVM),
  partition 5 for block.db LVs, partition 6 for SSD OSDs.
- Device paths that use `/dev/disk/by-path/` with SAS expander PHY addresses
  for slot stability (replacing a drive in the same bay keeps the same path).

Auto-discovery cannot express the HDD-to-SSD-db mapping. It also risks
claiming OS partitions or db partitions as OSD data. A mismap during automated
discovery would silently create OSDs without block.db acceleration, or worse,
destroy the OS volume.

## Decision

Every OSD is explicitly listed in each node's `host_vars` file. HDD OSDs
specify both the PHY slot (`path_phy`) and the exact block.db LV (`db`). SSD
OSDs specify the PHY slot and partition number. The `osds.yml` task file
iterates these lists with `loop:`, resolving each entry to a
`/dev/disk/by-path/` stable path.

Each entry is idempotent: the task checks `pvs` for an existing Ceph PV on the
resolved device and skips creation if one exists. Empty bays (missing block
device) are also skipped gracefully.

## Consequences

- **Positive:** Every OSD-to-disk-to-db mapping is version-controlled and
  auditable. Drive replacements are tracked with serial number comments in
  host_vars. No risk of accidental OSD creation on OS or db partitions.
- **Positive:** Slot-stable `by-path` addressing means a replacement drive in
  the same bay inherits the same OSD definition -- no host_vars edit needed.
- **Negative:** Adding a new node requires writing a complete host_vars file
  with all PHY mappings. This is manual but happens rarely (new hardware).
- **Negative:** Cannot scale to hundreds of heterogeneous nodes without
  templating. Acceptable for our 3-node (scaling to ~10) cluster size.
