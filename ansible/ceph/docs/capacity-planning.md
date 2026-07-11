# Capacity Planning

Audience: Managers, procurement, budget planning. For hardware specs and
disk layouts see [hardware.md](hardware.md); this doc is the sizing math.

## Current deployments

| Cluster | Nodes | HDD x size | Raw HDD | EC-usable (8+3) | 70%-full target |
|---|---|---|---|---|---|
| sietch (Austin) | 3 x Dell R730xd | 30 x 6 TB | ~164 TiB | ~119 TiB | ~83 TiB |

Each cluster also contributes ~1 TiB of SSD OSD on the boot SSDs (minor;
ignored in the math above).

Sietch has ~6 empty bays across its three nodes (block.db LVs pre-created),
worth +36 TB raw (~33 TiB) by populating them. No LVM or network changes
needed -- cheapest expansion path.

## Sizing formulas

```
EC-usable          = raw x (k / (k + m))   = raw x 8/11 = raw x 0.727
Operational target = EC-usable x 0.70       (keep cluster below 70% full)
Raw needed         = target_data / 0.727 / 0.70
```

`backfillfull` triggers at 85% full (stops recovery); `full` triggers at
95% (stops writes). 70% is the conservative operational ceiling --
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
you still need enough failure domains for EC -- see below.

## When to add drives vs. nodes

| | Add drives | Add a node |
|---|---|---|
| When | Empty bays exist with pre-created block.db LVs | All bays populated; need more IOPS, network, or failure domains |
| Cost | ~$30-50 per 6 TB HDD (used) | ~$1,000-1,500 per fully-populated node (used) |
| Adds | +3.96 TiB EC-usable per drive | +47 TiB EC-usable per fully-populated R730xd |
| Impact | Backfill only | Backfill + CRUSH reshape + monitoring/SSH/cephadm host onboarding |

## Failure domain ceiling

EC 8+3 needs 11 failure domains. Austin currently uses
`failure_domain=osd` (spreads across 30 OSDs across 3 nodes) -- works today
but a full-node loss degrades a large share of PGs. For host-level
failure domain you need **11+ nodes minimum**. Production (Yucca) will
want this; dev can tolerate the weaker guarantee.

## Durability and DR ceiling

The spice (production, htz-fsn1) backup-of-record stores objects in an EC 16+4
data pool with `failure_domain=host`. min_size is pinned to k+1 = 17 by the RGW
role. What that pool tolerates:

- **Reads:** survive up to m = 4 simultaneous host (or OSD) losses. With 4
  chunks gone the remaining 16 = k chunks still reconstruct every object.
- **Writes:** survive up to m - 1 = 3 simultaneous host losses. At the k+1
  floor a PG stays writable only while at least 17 shards are up; the 4th host
  loss drops a PG to k = 16 shards, which still serves reads but blocks writes
  until recovery restores a 17th shard. min_size is never set below k+1 --
  permitting writes at k shards would risk data loss if another shard were lost
  mid-recovery.

This is a **single-site** guarantee with **no rack diversity**: every node sits
in one datacenter (FSN1) and the failure domain is host, not rack. A rack, row,
PDU, or switch fault that takes down more than m hosts at once, or a whole-
datacenter loss (power, network, fire, flood), exceeds this ceiling -- there is
no second site and no off-region copy. The pool protects against disk and node
failure, not site failure. Off-site DR (a second region, or an external copy of
the backup-of-record) is out of scope for this cluster and would need a separate
replication path.

## block.db sizing

Rule of thumb: block.db ~ 4% of OSD data size.

- **Austin (6 TB HDDs):** 240 GiB LV per HDD matches the rule; 6 LVs
  consume 1,440 GiB of each SSD's partition 5 (see hardware.md).
- **Hetzner (22 TB HDDs):** 128 GiB LV is undersized against the 4% rule
  (would want 256-512 GiB). Acceptable for non-production/benchmark use;
  production deployments with 22 TB HDDs should target larger block.db.

If block.db fills up, BlueStore spills metadata to the HDD data partition
-- OSD keeps working but small-object operations slow down. Fix: grow the
block.db LV or reduce metadata density.
