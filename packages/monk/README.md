# monk

Prometheus exporter for measured Ceph scrub backlog. Ceph tracks per-PG
`last_scrub_stamp` / `last_deep_scrub_stamp` but exports neither as metrics
(the mgr prometheus module ships only PG state counts and the
`PG_NOT_SCRUBBED` health booleans; upstream PR ceph/ceph#68925, which
implemented exactly this, was stale-bot-closed unmerged in Aug 2026). monk
polls `ceph pg ls -f json` and serves pool-level aggregates so scrub-cycle
dashboards report ground truth instead of estimates derived from scrub
read-byte counters.

Runs on the cluster's mon hosts, not Kubernetes; the ansible role that deploys
it lands in a follow-up PR. The image is the cluster ceph image plus the monk
binary, and the container needs `/etc/ceph` with a read-only keyring (mon r,
mgr r) mounted.

## Run

```
monk                                  # cluster host with ceph CLI + keyring
monk -ceph-cmd "cephadm shell -- ceph"
```

Flags: `-listen :9284`, `-refresh 2m`, `-timeout 90s`,
`-shallow-interval 168h`, `-deep-interval 672h`, `-ceph-cmd ceph`
(space-split command prefix). Keep the interval flags in step with the
cluster's `osd_scrub_max_interval` / `osd_deep_scrub_interval`.

## Metrics

| metric | labels | meaning |
|---|---|---|
| `ceph_pg_last_scrub_stamp` | pool_id | oldest per-PG shallow stamp in the pool, epoch seconds (name follows ceph PR #68925) |
| `ceph_pg_last_deep_scrub_stamp` | pool_id | oldest per-PG deep stamp in the pool |
| `ceph_scrub_pool_pgs` / `ceph_scrub_pool_bytes` | pool_id | PG count / stored bytes per pool |
| `ceph_scrub_overdue_pgs` / `ceph_scrub_overdue_bytes` | pool_id, depth | PGs / bytes whose stamp is older than the target interval |
| `ceph_scrub_age_bytes` | pool_id, depth, le | cumulative bytes with scrub age <= le seconds (1d..49d, +Inf) |
| `ceph_scrub_schedule_pgs` | state | PGs by scrub_schedule state (scheduled, queued, scrubbing, blocked, reserving, none, other) |
| `ceph_scrub_target_interval_seconds` | depth | the configured interval flags, so dashboards read targets from the scrape |
| `ceph_scrub_collect_success` / `_duration_seconds` / `_timestamp_seconds`, `ceph_scrub_parse_errors` | | collection health; alert on success == 0 or a stale timestamp |

Pool names come from joining `ceph_pool_metadata` (mgr module) on `pool_id`.
Several monk instances may be scraped for availability; dashboards dedup with
`max by (pool_id)`.

```
# deep-scrub cycle coverage
1 - sum(ceph_scrub_overdue_bytes{depth="deep"}) / sum(ceph_scrub_pool_bytes)

# work outstanding, bytes
sum(ceph_scrub_overdue_bytes{depth="deep"})
```
