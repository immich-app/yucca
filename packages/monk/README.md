# monk

Prometheus exporter for measured Ceph scrub backlog. Ceph tracks per-PG
`last_scrub_stamp` / `last_deep_scrub_stamp` but exports neither as metrics
(the mgr prometheus module ships only PG state counts and the
`PG_NOT_SCRUBBED` health booleans; upstream PR ceph/ceph#68925, which
implemented exactly this, was stale-bot-closed unmerged in Aug 2026). monk
polls `ceph pg ls -f json` and serves pool-level aggregates so scrub-cycle
dashboards report ground truth instead of estimates derived from scrub
read-byte counters.

Runs on the cluster's mon hosts, not Kubernetes; the scrub_exporter ansible
role (ansible/ceph/monk.yml) deploys it. The image is the cluster ceph image
plus the monk binary, and the container needs `/etc/ceph` with a read-only
keyring (mon r, mgr r) mounted. The container runs as the image's `ceph` user
(uid 167), so the keyring file must be readable by that uid; a root-owned
0600 keyring fails as `no keyring found`.

## Run

```
monk                                  # cluster host with ceph CLI + keyring
monk -ceph-cmd "cephadm shell -- ceph"
```

Flags: `-listen :9284`, `-refresh 2m`, `-timeout 90s`, `-ceph-cmd ceph`
(space-split command prefix). Overdue targets follow the cluster: each
refresh reads `osd_scrub_max_interval` / `osd_deep_scrub_interval` from
`ceph config get osd` plus per-pool overrides from `osd pool ls detail`, so
the thresholds cannot drift from what the scrub scheduler targets.
`-shallow-interval` / `-deep-interval` pin a depth explicitly instead (pins
also suppress that depth's pool overrides); a failed interval read keeps the
last-known targets and logs a warning.

## Metrics

| metric | labels | meaning |
|---|---|---|
| `ceph_pg_last_scrub_stamp` | pool_id | oldest per-PG shallow stamp in the pool, epoch seconds (name follows ceph PR #68925) |
| `ceph_pg_last_deep_scrub_stamp` | pool_id | oldest per-PG deep stamp in the pool |
| `ceph_scrub_pool_pgs` / `ceph_scrub_pool_bytes` | pool_id | PG count / logical (data) bytes per pool; do not mix with raw-capacity metrics like `ceph_osd_stat_bytes_used` |
| `ceph_scrub_overdue_pgs` / `ceph_scrub_overdue_bytes` | pool_id, depth | PGs / bytes whose stamp is older than the target interval; PGs with unparsable stamps count here |
| `ceph_scrub_age_seconds` | pool_id, depth | histogram of scrub age weighted by bytes (buckets 1d..98d); `_sum/_count` gives mean data age, `histogram_quantile` the age of the Nth-percentile byte. Gauge semantics under a histogram TYPE: never apply `rate()`/`increase()` to its series (counter-reset math fabricates spikes), and `_count` counts bytes, not events |
| `ceph_scrub_schedule_pgs` | state | PGs by scrub_schedule state (scheduled, queued, scrubbing, blocked, reserving, none, other) |
| `ceph_scrub_target_interval_seconds` | pool_id, depth | the interval each pool's overdue numbers were judged against (cluster-read, or the pin) |
| `ceph_scrub_collect_success` / `_failures_total` / `_duration_seconds` / `_timestamp_seconds`, `ceph_scrub_parse_errors` | | collection health; alert per instance on success == 0 for 15m, on a timestamp older than three refresh intervals, and on parse_errors > 0. After five consecutive failures the stale snapshot is dropped, so the instance's pool series go absent instead of pinning dedup |
| `ceph_scrub_interval_read_success` / `_timestamp_seconds` | | whether the overdue thresholds still track the cluster; alert on success == 0 for an hour (stale thresholds judge overdue silently) |
| `ceph_scrub_build_info` | version | monk build metadata |

Pool names come from joining `ceph_pool_metadata` (mgr module) on `pool_id`.
Several monk instances are scraped for availability, and pool_ids repeat
across clusters, so every query dedups with `max by (cluster, pool_id)` and
applies the identical dedup to both sides of any ratio.

```
# work outstanding, bytes
sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))

# deep-scrub cycle coverage
1 - sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))
  / sum(max by (cluster, pool_id) (ceph_scrub_pool_bytes))
```

`ceph_scrub_pool_bytes` is logical data bytes; converting to raw for
comparison with `ceph_osd_stat_bytes_used` uses the per-pool expansion
factor `ceph_pool_stored_raw / ceph_pool_stored`.
