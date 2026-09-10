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
| `ceph_scrub_pool_omap_bytes` / `ceph_scrub_overdue_omap_bytes` | pool_id (+ depth) | omap bytes, which `num_bytes` and therefore `ceph_scrub_pool_bytes` exclude. An index pool stores its whole bucket listing in omap and reports zero data bytes, so byte-weighted coverage cannot see it fall behind; judge those pools on PGs or on these |
| `ceph_scrub_completions_total` / `ceph_scrub_completed_bytes_total` | pool_id, depth | PGs / bytes observed completing a scrub, counted by diffing stamps between refreshes. Dedup these by rating FIRST: `max by (cluster, pool_id) (rate(...[1h]))`. Taking `max` of the counters before `rate` reads an instance restart as a jump, because instances start at different times and each counts independently |
| `ceph_scrub_overdue_pgs` / `ceph_scrub_overdue_bytes` | pool_id, depth | PGs / bytes whose stamp is older than the target interval; PGs with unparsable stamps count here. **This has a nonzero floor on a healthy cluster and is not a verdict input**: ceph randomizes eligibility past the interval (`osd_deep_scrub_randomize_ratio`) and pushes a deferred target's `not_before`, so PGs legitimately sit past the interval while ceph is still on schedule. Read it as workload outstanding |
| `ceph_scrub_due_pgs` / `ceph_scrub_due_bytes` | pool_id, depth | PGs / bytes whose next scrub ceph itself scheduled for a time already past, read out of `scrub_schedule`. Zero unless the scheduler is losing ground, so this is the one to drive "are we behind" off. Caveat on the depth label: `scrub_schedule` names only the nearest of a PG's two targets, so a PG late at both depths is counted once, against whichever ceph named. Summed across depths the lateness is never hidden; per depth it can shift. `ceph_scrub_breach_pgs` is computed from the stamps instead and has no such ambiguity |
| `ceph_scrub_due_max_seconds` | pool_id, depth | how far past its ceph-scheduled time the latest PG is; minutes is normal jitter, hours is a real stall |
| `ceph_scrub_breach_pgs` / `ceph_scrub_breach_bytes` | pool_id, depth | PGs / bytes past `target interval x (1 + mon_warn_pg_not_scrubbed_ratio)`, the age at which the mon raises PG_NOT_SCRUBBED / PG_NOT_DEEP_SCRUBBED. Nonzero here means `ceph health` is warning (or is about to), so a dashboard keyed on it cannot contradict the cluster |
| `ceph_scrub_age_seconds` | pool_id, depth | histogram of scrub age weighted by bytes (buckets 1d..98d); `_sum/_count` gives mean data age, `histogram_quantile` the age of the Nth-percentile byte. Gauge semantics under a histogram TYPE: never apply `rate()`/`increase()` to its series (counter-reset math fabricates spikes), and `_count` counts bytes, not events |
| `ceph_scrub_schedule_pgs` | state | PGs by scrub_schedule state (scheduled, queued, scrubbing, blocked, reserving, none, other) |
| `ceph_scrub_target_interval_seconds` | pool_id, depth | the interval each pool's overdue numbers were judged against (cluster-read, or the pin) |
| `ceph_scrub_warn_interval_seconds` | pool_id, depth | the age the breach numbers were judged against: the target interval scaled by the mon's warn ratio (cluster-read, defaults 0.5 shallow / 0.75 deep) |
| `ceph_scrub_collect_success` / `_failures_total` / `_duration_seconds` / `_timestamp_seconds`, `ceph_scrub_parse_errors`, `ceph_scrub_schedule_parse_errors` | | collection health; alert per instance on success == 0 for 15m, on a timestamp older than three refresh intervals, and on either parse-error gauge > 0 (a `scrub_schedule` format change would otherwise zero `ceph_scrub_due_pgs` silently). After five consecutive failures the stale snapshot is dropped, so the instance's pool series go absent instead of pinning dedup |
| `ceph_scrub_interval_read_success` / `_timestamp_seconds` | | whether the overdue thresholds still track the cluster; alert on success == 0 for an hour (stale thresholds judge overdue silently) |
| `ceph_scrub_build_info` | version | monk build metadata |

Pool names come from joining `ceph_pool_metadata` (mgr module) on `pool_id`.
Several monk instances are scraped for availability, and pool_ids repeat
across clusters, so every query dedups with `max by (cluster, pool_id)` and
applies the identical dedup to both sides of any ratio.

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

# days to clear the deep backlog at the current pace
sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))
  / (sum(max by (cluster, pool_id) (rate(ceph_scrub_completed_bytes_total{depth="deep"}[6h]))) * 86400)

# deep-scrub cycle coverage
1 - sum(max by (cluster, pool_id) (ceph_scrub_overdue_bytes{depth="deep"}))
  / sum(max by (cluster, pool_id) (ceph_scrub_pool_bytes))
```

`ceph_scrub_pool_bytes` is logical data bytes; converting to raw for
comparison with `ceph_osd_stat_bytes_used` uses the per-pool expansion
factor `ceph_pool_stored_raw / ceph_pool_stored`.
