# ADR-011: Cephadm OSD Service Specs over Imperative Per-Disk Loops

## Status

Accepted (2026-04-26). Refines [ADR-002](./002-explicit-osd-mapping.md)
(explicit OSD-to-disk mapping) — preserves its anti-auto-discovery spirit
while changing *where* the explicit mapping is expressed (cephadm spec
applied via `ceph orch apply`, not an Ansible per-disk loop).

## Context

`roles/ceph_deploy/tasks/osds.yml` originally created OSDs by iterating
each declared HDD/SSD in host_vars and invoking `cephadm ceph-volume lvm
create --dmcrypt --data <disk> --block.db <lv>` per disk. The disk path
was composed inside the role:

```jinja2
DISK="/dev/disk/by-path/{{ sas_path_prefix }}-{{ item.path_phy }}-lun-0"
```

This worked for sietch (Dell R730xd, SAS expander, dual-SSD-VG topology)
because every assumption baked into the composition was sietch-shape:

- `sas_path_prefix` exists per host
- `path_phy` is a slot identifier (`phy0`, `phy1`, ...) appended to the prefix
- `-lun-0` suffix is the SAS LUN convention
- SSD OSDs are partitions on the boot SSD (`-part6`)

When the painbox (Hetzner SX295) cluster came online for the first integration
test of this codebase, every one of those assumptions broke:

1. Painbox is SATA + NVMe, no SAS expander → `sas_path_prefix` undefined,
   role failed at template-resolution time.
2. SATA by-path strings are `pci-XXXX:XX:XX.X-ata-N` directly (no `-lun-N`
   suffix) — operator authors the full path identifier as `path_phy`.
3. Painbox SSD OSD is an LV on the NVMe RAID-1 VG (`vg0/ssd-osd`), not a
   partition — different shape entirely from sietch's SSD OSDs.

The fix could have been per-shape branching inside `osds.yml`'s shell loop
(if/else for path composition; if/else for partition vs LV), but every
phase of the role beyond OSDs (RGW, monitoring, etc.) was already migrating
toward cephadm's declarative service-spec pattern (`rgw-spec.yaml.j2` was
already in place). The OSD path was the obvious next migration.

## Decision

OSD creation is now declarative via a cephadm OSD service spec rendered
from per-host data, applied via `ceph orch apply osd -i /etc/ceph/osd-spec.yml`.

1. **`templates/osd-spec.yml.j2`** renders one document per host (HDD spec
   + optional SSD spec). Per-host because sietch nodes have unique SAS
   prefixes per chassis — a shared spec with `data_devices.paths` requires
   identical paths across all `placement.hosts`.
2. **Hardware-shape branching** lives in the template's Jinja conditional,
   not in role logic:
   - `sas_path_prefix is defined` → sietch-shape path composition
   - `sas_path_prefix is undefined` → painbox-shape, use `path_phy`
     directly (full PCI-ATA identifier from host_vars)
   - SSD OSD: `lv is defined` → painbox-style LV path; else sietch-style
     partition-on-SAS-disk
3. **`tasks/osds.yml`** is now thin: render template → `ceph orch apply` →
   wait for provisioning → wait for OSDs up → defensive `ceph osd unset
   noin` → reweight-zero safety net. ~150 LOC down from ~230.
4. **Encryption** is set in the spec (`encrypted: true`), not via a
   per-disk `--dmcrypt` flag. Cephadm provisions LUKS internally and
   stores the dm-crypt key in the MON config-key store as before.
5. **Idempotency** is provided by cephadm — re-applying the same spec is
   a no-op. New disks (e.g. populating an empty bay) are picked up
   automatically. Existing OSDs are not destroyed by a spec change;
   removal requires `ceph orch osd rm`.

## Out of scope (for this ADR)

- **Extending the spec pattern to MON/MGR/RGW/monitoring placement**
  — `rgw-spec.yaml.j2` already does this for RGW; the rest of the role
  still uses imperative `ceph orch apply mon --placement=...` (and
  similar for MGR/monitoring). Refactoring those is a separate body of
  work — see "Option C" in the architecture session log; planned as a
  dedicated follow-up PR.
- **TF-rendered service specs.** TF already has all the cluster identity
  it needs to render every cephadm spec deterministically. Moving spec
  rendering from Ansible (Jinja in role templates) to TF (Jinja in
  module templates) would shift the boundary further toward
  "TF declares, Ansible applies." Same Option-C follow-up.
- **Auto-discovery via `data_devices.rotational: 1` filter.** Cephadm
  supports filter-based device selection. We chose explicit `paths`
  to preserve ADR-002's "no auto-discovery surprises" stance — empty
  bays on sietch and the SSD OSD on painbox can't be expressed with
  filters alone.

## Consequences

- **Positive:** hardware-shape independence. Painbox (SATA + NVMe-RAID
  + LV-backed SSD OSD) and sietch (SAS expander + dual-SSD-VG) deploy
  through the same role with the same task file. Future clusters with
  yet other shapes (Hetzner AX-line, Equinix bare-metal, etc.) need
  only their own host_vars; the role doesn't change.
- **Positive:** `osds.yml` shrinks ~35%; the deleted code was the most
  fragile part (per-disk shell loops with embedded Jinja path
  composition).
- **Positive:** ADR-002's explicit-mapping spirit is preserved. Paths
  are still listed explicitly in the spec — cephadm doesn't auto-discover.
  Empty bays stay empty; partitions stay reserved for OS/block.db.
- **Positive:** Aligns with cephadm's intended deployment model. All
  modern cephadm operators use service specs; the imperative-loop
  pattern is legacy.
- **Neutral:** The spec is rendered to `/etc/ceph/osd-spec.yml` on the
  bootstrap node and then applied. The file is overwritten on each
  re-render — operators inspecting the deployed state should query
  cephadm (`ceph orch ls --service-type osd --export`) rather than
  reading the on-disk spec, which may have been updated since the last
  apply.
- **Negative:** Cephadm's spec apply is async — the role polls until
  the expected OSD count is reached, with a 15-minute timeout. On a
  large cluster (hundreds of OSDs), this could exceed the timeout. Not
  a concern at current scale (15 OSDs painbox, 30 OSDs sietch).
- **Negative:** Debugging "why isn't this disk becoming an OSD?" is
  harder than with the per-disk loop, where the failing disk had its
  own log line. With cephadm, you check `ceph orch ls`,
  `ceph orch ps`, and `ceph cephadm osd activate <host> --dry-run` on
  the bootstrap node.

## Migration that landed with this ADR

- `templates/osd-spec.yml.j2` written (replaces stub that existed but
  was never wired in).
- `tasks/osds.yml` rewritten to render + apply + poll + safety net.
- `tasks/lvm-setup.yml` gated on `sas_path_prefix is defined` — sietch
  still needs the role's defensive VG/LV recovery path; painbox skips
  because installimage's post-install owns LVM lifecycle.
- Validated end-to-end against a freshly-reprovisioned painbox: 15/15
  OSDs up + in, all encrypted (15 dm-crypt keys in MON store), correct
  per-host service IDs (`osd.painbox-ceph-evelyn-hdd`,
  `osd.painbox-ceph-evelyn-ssd`).
- Sietch validation deferred — sietch is currently deployed and
  healthy; the spec apply against existing OSDs is idempotent (no-op
  when paths match), but a real test on sietch is a separate operational
  step planned for the next sietch maintenance window.

## References

- [ADR-002](./002-explicit-osd-mapping.md) — explicit OSD-to-disk mapping (refined, not superseded)
- [ADR-009](./009-tf-first-op-inject-over-vault-password-sh.md) — TF-first secrets (companion architectural shift)
- `roles/ceph_deploy/templates/osd-spec.yml.j2` — the template
- `roles/ceph_deploy/tasks/osds.yml` — the thin applier
- [Cephadm OSD Service docs](https://docs.ceph.com/en/latest/cephadm/services/osd/)
