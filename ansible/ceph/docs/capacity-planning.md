# Capacity Planning

Audience: Managers, procurement, budget planning. For hardware specs and
disk layouts see [hardware.md](hardware.md); this doc is the sizing math.

## Current deployments

| Cluster | Nodes | HDD × size | Raw HDD | EC-usable (8+3) | 70%-full target |
|---|---|---|---|---|---|
| sietch (Austin) | 3 × Dell R730xd | 30 × 6 TB | ~164 TiB | ~119 TiB | ~83 TiB |

Each cluster also contributes ~1 TiB of SSD OSD on the boot SSDs (minor;
ignored in the math above).

Sietch has ~6 empty bays across its three nodes (block.db LVs pre-created),
worth +36 TB raw (~33 TiB) by populating them. No LVM or network changes
needed — cheapest expansion path.

## Sizing formulas

```
EC-usable          = raw × (k / (k + m))   = raw × 8/11 = raw × 0.727
Operational target = EC-usable × 0.70       (keep cluster below 70% full)
Raw needed         = target_data / 0.727 / 0.70
```

`backfillfull` triggers at 85% full (stops recovery); `full` triggers at
95% (stops writes). 70% is the conservative operational ceiling —
substantial headroom for failures, rebalancing, and growth.

Ceph also consumes small amounts for index pools, RGW metadata, and the
non-EC multipart-upload pool. All negligible relative to data (< 1% each
at steady state).

## Worked example

Target: 50 TiB of application data.

```
raw_needed = 50 / 0.727 / 0.70 = 98 TiB raw HDD
HDDs       = 98 TiB / 5.45 TiB = 18 drives (at 6 TB each)
Nodes      = 18 / 12 bays      = 2 nodes minimum (populated)
```

For 22 TB Hetzner drives the drive count is much lower (~5 drives) but
you still need enough failure domains for EC — see below.

## When to add drives vs. nodes

| | Add drives | Add a node |
|---|---|---|
| When | Empty bays exist with pre-created block.db LVs | All bays populated; need more IOPS, network, or failure domains |
| Cost | ~$30–50 per 6 TB HDD (used) | ~$1,000–1,500 per fully-populated node (used) |
| Adds | +3.96 TiB EC-usable per drive | +47 TiB EC-usable per fully-populated R730xd |
| Impact | Backfill only | Backfill + CRUSH reshape + monitoring/SSH/cephadm host onboarding |

## Failure domain ceiling

EC 8+3 needs 11 failure domains. Austin currently uses
`failure_domain=osd` (spreads across 30 OSDs across 3 nodes) — works today
but a full-node loss degrades a large share of PGs. For host-level
failure domain you need **11+ nodes minimum**. Production (Yucca) will
want this; dev can tolerate the weaker guarantee.

## block.db sizing

Rule of thumb: block.db ≈ 4% of OSD data size.

- **Austin (6 TB HDDs):** 240 GiB LV per HDD matches the rule; 6 LVs
  consume 1,440 GiB of each SSD's partition 5 (see hardware.md).
- **Hetzner (22 TB HDDs):** 128 GiB LV is undersized against the 4% rule
  (would want 256–512 GiB). Acceptable for non-production/benchmark use;
  production deployments with 22 TB HDDs should target larger block.db.

If block.db fills up, BlueStore spills metadata to the HDD data partition
— OSD keeps working but small-object operations slow down. Fix: grow the
block.db LV or reduce metadata density.
