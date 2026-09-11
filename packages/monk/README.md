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
(space-split command prefix). Thresholds follow the cluster. Each refresh
reads from `ceph config get osd` the overdue targets (`osd_scrub_max_interval`,
`osd_deep_scrub_interval`) and the scrub scheduler's inputs
(`osd_scrub_min_interval`, `osd_deep_scrub_interval`,
`osd_scrub_interval_randomize_ratio`, `osd_deep_scrub_interval_cv`; the
scheduler itself never reads `osd_scrub_max_interval`), the
health check's inputs from `ceph config get mgr` (`osd_scrub_max_interval`,
`osd_deep_scrub_interval`, `mon_warn_pg_not_scrubbed_ratio`,
`mon_warn_pg_not_deep_scrubbed_ratio`; PG_NOT_SCRUBBED /
PG_NOT_DEEP_SCRUBBED is computed in the mgr with the mgr's config, so a value
set only in the osd section does not move it), and the pool options
`scrub_min_interval` / `scrub_max_interval` / `deep_scrub_interval` from
`osd pool ls detail`, which override either view when > 0. The read is all or
nothing: a failed read keeps every last-known value and logs a warning.
`-shallow-interval` / `-deep-interval` pin a depth's overdue interval (and
suppress that depth's pool override for overdue). Pins affect overdue only;
late and breach track what ceph itself does.

## Metrics

Three stamp-based thresholds per pool and depth: overdue (target interval),
late (latest target) and breach (warn deadline). Their order differs by depth.
With spice's values deep is overdue 28d < late 39.2d < breach 49d, and shallow
is late 1.5d < overdue 7d < breach 10.5d, so late does not sit between overdue
and breach in general.

| metric | labels | meaning |
|---|---|---|
| `ceph_pg_last_scrub_stamp` | pool_id | oldest per-PG shallow stamp in the pool, epoch seconds (name follows ceph PR #68925) |
| `ceph_pg_last_deep_scrub_stamp` | pool_id | oldest per-PG deep stamp in the pool |
| `ceph_scrub_pool_pgs` / `ceph_scrub_pool_bytes` | pool_id | PG count / logical (data) bytes per pool; do not mix with raw-capacity metrics like `ceph_osd_stat_bytes_used` |
| `ceph_scrub_pool_omap_bytes` / `ceph_scrub_overdue_omap_bytes` | pool_id (+ depth) | omap bytes, which `num_bytes` and therefore `ceph_scrub_pool_bytes` exclude. An index pool stores its whole bucket listing in omap and reports zero data bytes, so byte-weighted coverage cannot see it fall behind; judge those pools on PGs or on these |
| `ceph_scrub_completions_total` / `ceph_scrub_completed_bytes_total` | pool_id, depth | PGs / bytes observed completing a scrub, counted by diffing stamps between refreshes. Dedup these by rating FIRST: `max by (cluster, pool_id) (rate(...[1h]))`. Taking `max` of the counters before `rate` reads an instance restart as a jump, because instances start at different times and each counts independently |
| `ceph_scrub_overdue_pgs` / `ceph_scrub_overdue_bytes` | pool_id, depth | PGs / bytes whose stamp is older than the target interval; PGs with unparsable stamps count here. **This has a nonzero floor on a healthy cluster and is not a verdict input**: the deep floor is PGs whose randomized target falls between the interval and `interval x (1 + 2 x osd_deep_scrub_interval_cv)`, plus failed targets that `delay_on_failure` pushed forward, so PGs legitimately sit past the interval while ceph is still on schedule. Read it as workload outstanding |
| `ceph_scrub_late_pgs` / `ceph_scrub_late_bytes` | pool_id, depth | PGs / bytes whose stamp is older than the latest target, the top of ceph's randomized scheduling window (`scheduled_at`): every target ceph could have drawn has passed, so a PG here is behind whatever the cause. With a 24x7 scrub window it reads zero on a healthy cluster except for a PG briefly queued past its bound; a restricted window (`osd_scrub_begin_hour` / `osd_scrub_end_hour`, `osd_scrub_begin_week_day` / `osd_scrub_end_week_day`) or scrubbing blocked by recovery (`osd_scrub_during_recovery` false) adds up to the closed time on top, and shallow late then reads nonzero routinely. Unparsable stamps do not count (a lateness claim needs an established age). Judged from stamps, not the `scrub_schedule` time: ceph publishes a time only while no target is eligible, so it is always in the future, and `delay_on_failure` moves it forward |
| `ceph_scrub_late_max_seconds` | pool_id, depth | how far the oldest PG is past its latest target, 0 if none. With a 24x7 scrub window a deep value over a day (86400) is falling behind, the day absorbing normal queue wait; a restricted window needs a grace of at least its closed time |
| `ceph_scrub_breach_pgs` / `ceph_scrub_breach_bytes` | pool_id, depth | PGs / bytes strictly older than the mgr's warn deadline, `interval x (1 + ratio)`: interval is pool `scrub_max_interval` / `deep_scrub_interval` if > 0, else mgr-view `osd_scrub_max_interval` / `osd_deep_scrub_interval`; ratio is mgr-view `mon_warn_pg_not_scrubbed_ratio` / `mon_warn_pg_not_deep_scrubbed_ratio`. This mirrors PG_NOT_SCRUBBED / PG_NOT_DEEP_SCRUBBED; nonzero means `ceph health` is warning or is about to. Pins are ignored. A ratio of 0 disables ceph's check at that depth, and the series is then absent. Unparsable stamps are not breach, so it can read 0 while the mgr warns on a PG monk cannot parse; trust a 0 only while `ceph_scrub_parse_errors` is 0 and `ceph_scrub_interval_read_success` is 1 |
| `ceph_scrub_age_seconds` | pool_id, depth | histogram of scrub age weighted by bytes (buckets 1d..98d); `_sum/_count` gives mean data age, `histogram_quantile` the age of the Nth-percentile byte. Gauge semantics under a histogram TYPE: never apply `rate()`/`increase()` to its series (counter-reset math fabricates spikes), and `_count` counts bytes, not events |
| `ceph_scrub_schedule_pgs` | state | PGs by scrub_schedule state (scheduled, queued, scrubbing, blocked, reserving, none, other) |
| `ceph_scrub_target_interval_seconds` | pool_id, depth | the age overdue was judged against: pool option, osd-view `osd_scrub_max_interval` / `osd_deep_scrub_interval`, or the pin |
| `ceph_scrub_latest_target_seconds` | pool_id, depth | the age late was judged against. Deep: `deepInterval x (1 + 2 x osd_deep_scrub_interval_cv)`, deepInterval = pool `deep_scrub_interval` if > 0 else osd-view `osd_deep_scrub_interval` (ceph clamps the randomized target to the interval +/- 2 standard deviations). Shallow: `minInterval x (1 + osd_scrub_interval_randomize_ratio)`, minInterval = pool `scrub_min_interval` if > 0 else osd-view `osd_scrub_min_interval`. Pins never apply; the OSD scheduler does not know them |
| `ceph_scrub_warn_interval_seconds` | pool_id, depth | the age breach was judged against, the mgr-view deadline above (defaults 0.5 shallow / 0.75 deep). Absent for a depth whose ratio is 0 |
| `ceph_scrub_collect_success` / `_failures_total` / `_duration_seconds` / `_timestamp_seconds`, `ceph_scrub_parse_errors` | | collection health; alert per instance on success == 0 for 15m, on a timestamp older than three refresh intervals, and on parse_errors > 0. After five consecutive failures the stale snapshot is dropped, so the instance's pool series go absent instead of pinning dedup |
| `ceph_scrub_interval_read_success` / `_timestamp_seconds` | | whether the last cluster read (osd view, mgr view and pool options, all or nothing) succeeded. Pins replace only overdue's interval, so the read runs even with both depths pinned; alert on success == 0 for an hour (stale values judge overdue, late and breach silently) |
| `ceph_scrub_build_info` | version | monk build metadata |

Pool names come from joining `ceph_pool_metadata` (mgr module) on `pool_id`.
Several monk instances are scraped for availability, and pool_ids repeat
across clusters, so every query dedups with `max by (cluster, pool_id)` when
filtered to one depth and `max by (cluster, pool_id, depth)` when not (dropping
`depth` would fold the two depths into one value), and applies the identical
dedup to both sides of any ratio.

Completions are counted, not sampled: monk diffs each PG's stamp against the
previous refresh, so a PG appearing or disappearing (pool deletion, PG split)
is skipped rather than counted as a scrub. The first refresh after start has no
predecessor, so the counters begin at zero and the first interval's completions
are unobservable.

```
# work outstanding, bytes
sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))

# deep scrubs completed per day
sum(max by (cluster, pool_id) (rate(ceph_scrub_completions_total{depth="deep"}[6h]))) * 86400

# outstanding deep work in days at the current completion pace (like overdue
# itself this has a nonzero floor; not a time-to-clear estimate)
sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))
  / (sum(max by (cluster, pool_id) (rate(ceph_scrub_completed_bytes_total{depth="deep"}[6h]))) * 86400)

# deep-scrub cycle coverage; sits below 100% by the overdue floor on a healthy
# cluster, so it is not a verdict input
1 - sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))
  / sum(max by (cluster, pool_id) (ceph_scrub_pool_bytes))

# PGs past ceph's latest target, per depth (zero when healthy)
sum by (depth) (max by (cluster, pool_id, depth) (ceph_scrub_late_pgs))

# falling behind: a deep PG more than a day past its latest target
max by (cluster) (ceph_scrub_late_max_seconds{depth="deep"}) > 86400

# deep PGs past the mgr warn deadline (PG_NOT_DEEP_SCRUBBED; nonzero means
# ceph health is warning or is about to)
sum(max by (cluster, pool_id) (ceph_scrub_breach_pgs{depth="deep"}))
```

`ceph_scrub_pool_bytes` is logical data bytes; converting to raw for
comparison with `ceph_osd_stat_bytes_used` uses the per-pool expansion
factor `ceph_pool_stored_raw / ceph_pool_stored`.
