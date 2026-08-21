# o11y/

Everything yucca ships to the o11y cluster, packaged as grafana-operator CRs
inside a single OCI artifact on GHCR: `dashboards/` (Grafana dashboard JSON,
rendered into `GrafanaDashboard` CRs) and `alerts/` (`GrafanaAlertRuleGroup`
CRs, authored directly). o11y applies the bundle with a Flux `OCIRepository` +
`Kustomization`; its grafana-operator renders the embedded JSON and registers
the alert rules.

## The set

Every series at o11y carries `cluster` (`father` k8s / `spice` ceph / `netops`
fabric tier / `luke` staging), `site`, `env`, and `project="yucca"`. Dashboard
titles follow o11y's `Component / Subarea` convention (`Yucca / Overview`,
`Ceph / Health`, `Kubernetes / Views / Global`, `Logs / michael`, …); the
`yucca` folder is what distinguishes our copies from o11y's own. Each dashboard uses a
`$datasource` variable — no datasource UIDs are baked in. Dashboards with logs
panels additionally use a `$logs_datasource` variable (the VictoriaLogs grafana
datasource); log lines carry the same `cluster`/`site`/`env` fields, stamped by
victoria-logs-collector.

| File (= uid) | Covers | Source metrics |
| --- | --- | --- |
| `yucca-overview.json` | Single pane of glass: backup data plane + platform | michael OTLP, `ceph_rgw_*`, cadvisor, PVCs, coredns |
| `yucca-michael.json` | Restic gateway deep dive: HTTP + S3 backend pool + source networks + logs | `http.server.request.*`, `s3.backend.*`, `traffic.*` (OTel, dotted names), VictoriaLogs |
| `yucca-top-users.json` | Fleet-wide top talkers: storage, traffic, parallelism, stale backups per user (rows link to the per-user board) | `rgw_repository_*`, `blobs.*`, `client.request.*`, `user_last_*` (all keyed by user id) |
| `yucca-per-user.json` | Single-user drill-down: storage, backup health, traffic, client behaviour, logs. Deep-linkable as `/d/yucca-per-user?var-user=<id>` (`yuctl users view-dashboard`) | `rgw_repository_*`, `blobs.*`, `client.*`, `user_*`, VictoriaLogs |
| `yucca-spice-rgw-capacity.json` | RGW/pool capacity, S3 perf, OSD/BlueStore internals | `ceph_pool_*`, `ceph_rgw_*`, `ceph_osd_*`, `node_*` |
| `yucca-spice-ceph-health.json` | Cluster health: quorum, OSDs, PGs, recovery, latency | `ceph_health_*`, `ceph_pg_*`, `ceph_osd_*` |
| `yucca-spice-nodes.json` | 48-node fleet hotspots: CPU/mem/disk/fabric VLANs | `node_*` (job `ceph-node-exporter`) |
| `yucca-spice-blockdb-bluefs.json` | block.db headroom: spillover tripwire, per-OSD utilization and growth, BlueFS internals | `ceph_bluefs_*`, `ceph_bluestore_onode_*`, `ceph_osd_metadata` |
| `yucca-spice-recovery-backfill.json` | Rebalance throughput in bytes and work outstanding, during an OSD purge / reweight / host drain. Complements the recovery ops/s on `yucca-spice-ceph-health` | `ceph_pool_recovering_*`, `ceph_pg_{backfilling,backfill_wait,remapped}`, `ceph_num_objects_{misplaced,degraded}` |
| `yucca-spice-scrub.json` | Scrub progress: which hosts are still scrubbing (regular vs deep, as scrub primary), PGs in flight per level, and work outstanding for the deep cycle (bytes scrubbed vs raw used over the configured interval; needs that much retention) | `ceph_pg_{scrubbing,deep,wait}`, `ceph_osd_scrub_{sh,dp}_*_chunk_selected`, `ceph_osd_scrub_*_read_bytes`, `ceph_osd_{num_scrubs_started,successful_scrubs,failed_scrubs}_*`, `ceph_osd_stat_bytes_used`, `ceph_osd_metadata` |
| `yucca-father-kubernetes.json` | apiserver, coredns, workloads, PVCs, kubelet | `apiserver_*`, `container_*`, `kubelet_*`, `coredns_*` |
| `yucca-fabric-htz-fsn1.json` | Switch fabric: sFlow 5s rates, NETCONF, BGP, alarms | `sflow_*`, `junos_*` (port of the in-cluster netops board) |
| `yucca-telemetry-pipeline.json` | Is telemetry itself healthy: scrape + remote-write | `up`, `vmagent_remotewrite_*`, `vm_*` |

`yucca-overview` is the product single pane of glass: backup data plane stats
(including backup freshness from `user_last_successful_backup`), bandwidth per
carrier and top source ASNs (`traffic.*` by `asOrg`/`asn`), fabric + Cilium
BGP health with per-transit uplink bandwidth (Core-Backbone `et-0/0/27`, Colt
`et-1/0/27`), michael TTFB/backend errors, and a Kubernetes health row across
father + luke.

## Logs dashboards

One per service, built on the `$logs_datasource` (VictoriaLogs) variable plus
a custom `cluster` var and LogsQL textboxes (`$search` free-form filter;
`$request_id` on the request-serving services). Every query was validated
against the live VictoriaLogs before landing; query types are the plugin's
real enum (`instant` for streams/tables, `statsRange` for time series, `hits`
for the by-level volume histograms) — NOT the `raw_logs` fallback. These
dashboards deliberately carry no prometheus `$datasource` variable so the
linter's PromQL rule stays away from LogsQL.

| File (= uid) | Service | Beyond the common set (volume by level/pod, error stream + top messages, live stream) |
| --- | --- | --- |
| `yucca-logs-yucca-api.json` | yucca-api | status_code breakdown, top handlers with avg latency, slowest requests, 5xx lines — request lines are SAMPLED |
| `yucca-logs-admin-api.json` | yucca-admin-api | same as yucca-api |
| `yucca-logs-michael.json` | michael | requests by status, top routes/users/source networks with bytes, slowest requests |
| `yucca-logs-web.json` | web | unstructured stdout; keyword-based error detection |
| `yucca-logs-metrics-worker.json` | yucca-metrics-worker | sync-run markers (5m cron heartbeat) + sync log |
| `yucca-logs-meta.json` | meta | nginx access lines; 4xx/5xx via regex |

Log-level conventions baked into the queries: pino services log numeric
levels as strings (`30` info / `40` warn / `50` error / `60` fatal), michael
logs zerolog strings (`info`/`warn`/`error`), web and meta have no level
field (keyword heuristics). Regex filters use LogsQL backtick strings —
single-quoted regex strings fail to parse.

## Imported dashboards

The generic service dashboards are imported from upstream by
`scripts/import-upstream.py` (run it to refresh; it overwrites local edits) and
normalized to the house conventions: uid = file name, `$datasource` variable,
and a `$cluster` variable injected into every PromQL selector so the
multi-cluster data at o11y stays separated (the dotdc k8s boards already carry
one). Provenance and pinned versions live in the script; each dashboard's
`description` names its source URL.

| File (= uid) | Upstream |
| --- | --- |
| `yucca-k8s-{global,namespaces,nodes,pods,apiserver,coredns}.json` | dotdc/grafana-dashboards-kubernetes |
| `yucca-cilium.json`, `yucca-cilium-operator.json`, `yucca-hubble.json` | cilium/cilium (pinned to the deployed version; hubble http panels pruned — only dns/drop/tcp/flow/icmp metric sets are enabled) |
| `yucca-node-exporter.json` | rfmoz/grafana-dashboards node-exporter-full |
| `yucca-flux.json`, `yucca-flux-controllers.json` | fluxcd/flux2-monitoring-example |
| `yucca-cnpg.json` | cloudnative-pg/grafana-dashboards, plus an appended Backups row (Barman Cloud: base-backup/PITR ages, WAL archive queue) mirroring the `yucca-database` alert group |
| `yucca-vmagent.json` | VictoriaMetrics official vmagent board |

Per-user metric inventory (used by the two user dashboards): michael counts
bytes moved per user/repository/blob-type (`blobs.*`, labels
`customerId`/`repositoryId`/`type`) and requests per user
(`http.server.request.{count,errors}` carry `customerId`/`repositoryId` on
authenticated requests; the duration/TTFB histograms stay route-scoped),
michael also accumulates per-client request-seconds (`client.request.*`) and a
per-client concurrency high-water gauge (`client.requests.peak`),
yucca-metrics-worker gauges authoritative RGW bucket usage every 5 min
(`rgw_repository_*`), yucca-api / admin-api count every request per handler and
customer (`api_request_count`, unsampled even though the request log lines are
sampled), and yucca-api gauges client-reported backup health
(`user_repository_size`, `user_last_*` — labels `user_id`/`repository_id`).
Known gaps: no API-side latency histograms, no per-client retry count (restic
retries are invisible to michael and the orchestrator's restic wrapper drops
stderr on success), and nothing scrapes CNPG or the envoy gateways on father.

**Reading the per-client instruments.** `client.request.seconds` is a counter of
accumulated request-seconds labeled by identity only (`customerId`,
`repositoryId`, `connection` — no route or status). Its rate IS average
parallelism, by Little's Law: `rate(client.request.seconds[5m])` is the mean
number of that client's requests in flight over the window, needing no
per-client state to compute. Dividing by the matching request rate gives mean
duration, and `client.request.ttfb_seconds` does the same for time-to-first-byte
— duration includes streaming the body, so the two diverging is how you tell a
slow client from a slow backend. `client.requests.peak` covers what an average
cannot, a client that saturates its `rest.connections` budget in bursts; it is
per michael replica, so summing across replicas is an upper bound whereas the
Little's Law average sums exactly.

Source-network inventory (the "Source networks" row on the michael board):
michael also counts traffic by the CLIENT's autonomous system —
`traffic.{uploaded_bytes,downloaded_bytes,requests}`, labels `asn`/`asOrg`.
These are deliberately separate from the `blobs.*` family: `blobs.*` answers
"which customer moved this" and only counts authenticated 2xx requests, the
`traffic.*` counters answer "which network is this coming from" and count every
request, including the unauthenticated and rejected ones. The client address
comes from the LAST `X-Forwarded-For` entry — the only one the gateway wrote
itself (`CLIENT_IP_HEADER`) — and is resolved against an IP→ASN database baked
into the michael image at `/etc/michael/asn.mmdb` (`ASN_DB_PATH`; DB-IP's free
ASN Lite, MaxMind-DB format, CC BY 4.0). Sources reaching us on-net report as
`private`, public addresses the database does not resolve as `unknown` — which
is also what an image built while db-ip.com was unreachable reports for
everything, since a missing database warns rather than failing the pod.
**Addresses are not a metric label** (unbounded cardinality): `client_ip`,
`asn` and `as_org` ride on every michael access-log line instead, which is what
the "Top source addresses" table aggregates out of VictoriaLogs.

## Alerts

`alerts/*.yaml` are `GrafanaAlertRuleGroup` CRs, evaluated by o11y's Grafana
(Grafana-managed alerting). Dropping a file here is the whole job: delivery —
contact points, notification policy, Discord — is configured on the o11y side
and out of scope for this repo. Two bindings the CRs must get right:
`folderRef: yucca` (the bundle's own `GrafanaFolder`), and `datasourceUid:
VictoriaMetricsFleet` on every query node — alert rules cannot use a
`$datasource` variable the way dashboards do. NEVER pin the default
`VictoriaMetrics` datasource: it fronts `vmauth-self-select`, which serves
ONLY the o11y cluster's own series, so every rule over yucca/fabric/ceph data
evaluates to NoData and sits Normal through real outages (this shipped, and
the Colt transit outage went unalerted until it was caught). Only
`VictoriaMetricsFleet` (vmselect direct) sees the whole fleet — the same
reason every dashboard's `$datasource` variable carries the
`/^VictoriaMetrics Fleet$/` regex.

Conventions:

- **`project="yucca"` on every selector**: the fleet datasource serves every
  tenant's series (harbor, o11y itself, …), so each rule query is scoped to
  the project label our vmagents stamp on all yucca-owned data — without it,
  generic selectors (flux, cert-manager, k8s) fire on other tenants'
  clusters.
- **Severity**: rules carry a `severity` label (`critical` | `warning`) for
  o11y's notification policy to route on. Every rule carries a `description`
  annotation that names the cluster/host, so a notification is actionable
  without opening Grafana.
- **Grafana threshold semantics**: the condition is "query A > 0", and Grafana
  treats a value of 0 as normal — so `== 0`-style PromQL uses `== bool 0`
  (firing value 1), and value-carrying expressions are shaped to stay positive
  while firing (e.g. cert expiry alerts on seconds *inside* the warning
  window, which keeps growing past expiry, not seconds-to-expiry, which would
  go negative and stop firing).
- **Wrap slow-cadence instant selectors in `last_over_time(...[5m])`**:
  Grafana sends the rule group's evaluation interval as the instant query's
  `step`, and VictoriaMetrics uses `step` as the staleness lookback (setting
  `intervalMs` on the query model does NOT change it — measured). A metric
  whose cadence is at or above the step loses that race often enough that a
  multi-minute `for` can never sustain: the rule sits Normal via
  `noDataState: OK` while the condition is true. This silently killed the
  junos rules (60s NETCONF scrape) through a real transit outage. Range
  vectors are immune, so `rate()`/`increase()` expressions need nothing;
  every raw selector on a source slower than ~20s gets the wrap, and
  absence guards use `absent(last_over_time(x[10m]))`.
- **Guarded absence**: absence-style rules use
  `absent(x) and on() count(count_over_time(x[24h])) > 0` so an o11y instance
  that never receives that data (staging sees no fabric) never alarms, while
  data that *disappears* fires within minutes and self-resolves after 24h.
- **Scope**: only what nothing else delivers. Grafana-managed alerting is the
  notification path at o11y (its stock VMRule groups evaluate in vmalert but
  notify nowhere), so the essential k8s signals for the yucca clusters are
  declared here alongside the product rules. Ceph is alerted by cephadm's own
  prometheus/alertmanager on the ceph cluster (ansible/ceph), not from o11y.

| File | Covers |
| --- | --- |
| `michael.yaml` | 5xx ratio, RGW backend pool ejection, storage-op failures, unknown storage cluster, p99 TTFB, outage |
| `yucca-services.yaml` | API 5xx ratio, zero-replica outage of any yucca deployment |
| `backup-health.yaml` | metering pipeline stale, fleet-wide backup staleness (systemic only) |
| `database.yaml` | CNPG (yucca-db) backups: WAL archiving stuck, base backup failed/stale, exporter scrape gone |
| `kubernetes.yaml` | flux reconciliation, cert-manager expiry/readiness, node not ready, crashloops, PVC fill 90% warning / 95% critical (father+luke) |
| `cilium.yaml` | agent daemonset, BGP control-plane sessions (k8s side of the fabric peering) |
| `fabric.yaml` | transit BGP per-carrier (critical; peer IPs pinned from `fabric.tf`), all-transits-down, other BGP sessions, chassis alarms, interface errors, exporter/sFlow liveness |
| `telemetry.yaml` | per-cluster "stopped shipping metrics" (father/luke/netops/spice) |

Known gaps (no metric exists yet): michael token-introspection outages and
WORM rejections are log-only; restic client retries are invisible; nothing
scrapes the envoy gateways' data plane into alerting.

## Distribution contract

CI (`.github/workflows/o11y.yml`) validates every dashboard, renders each into a
self-contained `GrafanaDashboard` CR (the JSON embedded as gzip+base64 in
`spec.gzipJson`) filed under a `yucca` `GrafanaFolder`, adds any alert CRs from
`alerts/`, pushes that as ONE OCI artifact, and signs it with cosign. Tags
depend on the trigger:

```
ghcr.io/immich-app/yucca/o11y-manifests:main        # push to main: moving branch tag
ghcr.io/immich-app/yucca/o11y-manifests:v<version>  # release: immutable, one per release
ghcr.io/immich-app/yucca/o11y-manifests:latest      # release: follows the newest release
```

A push to `main` only updates the `main` tag; `v<version>` and `latest` move
solely on a published release (release-please).

The artifact is a single `application/vnd.cncf.flux.content.v1.tar+gzip` layer
(`folder.yaml` + `dashboards/` + `alerts/` in the tarball; no
`kustomization.yaml`, the kustomize-controller generates one recursively for
plain manifests), the native format a Flux `OCIRepository` extracts. It is
signed by digest (keyless, GitHub OIDC → Fulcio/Rekor), so every tag on that
digest is covered and o11y's `OCIRepository` can gate on it via `spec.verify`.
Verify manually with:

```bash
cosign verify ghcr.io/immich-app/yucca/o11y-manifests:latest \
  --certificate-identity-regexp '^https://github\.com/immich-app/yucca/\.github/workflows/o11y\.yml@refs/(heads/main|tags/v)' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The generated CRs carry only sane defaults (`instanceSelector: {dashboards:
grafana}`, `folderRef: yucca`, `resyncPeriod: 10m`); o11y overlays cluster
specifics via its Kustomization. The `o11y/` sources stay the source of truth;
the bundle is built by `.github/scripts/render-o11y-manifests.sh` at push time
and never committed.

## Consuming on o11y

One Flux `OCIRepository` + one `Kustomization` apply the whole bundle, and new
dashboards/alerts flow automatically. Requires Flux >= 2.6 (the `v1`
OCIRepository API):

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata: { name: yucca-o11y, namespace: flux-system }
spec:
  interval: 1m # detection latency for :main; a webhook Receiver makes it instant
  url: oci://ghcr.io/immich-app/yucca/o11y-manifests
  ref:
    tag: main # fast feedback; use `semver: ">=0.0.0"` or `tag: latest` for release-only
  verify: # gate on the CI cosign signature, pinned to main/release identities
    provider: cosign
    matchOIDCIdentity:
      - issuer: "^https://token\\.actions\\.githubusercontent\\.com$"
        subject: "^https://github\\.com/immich-app/yucca/\\.github/workflows/o11y\\.yml@refs/(heads/main|tags/v[^@]+)$"
  # secretRef: { name: ghcr-pull }   # only if the GHCR package stays private
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata: { name: yucca-o11y, namespace: flux-system }
spec:
  interval: 10m # drift correction; a new artifact revision applies instantly
  sourceRef: { kind: OCIRepository, name: yucca-o11y }
  path: ./
  prune: true
  targetNamespace: <grafana-ns>
  # Overlay cluster specifics without forking the CRs, e.g.:
  # patches:
  #   - target: { kind: GrafanaDashboard }
  #     patch: |
  #       - op: replace
  #         path: /spec/instanceSelector/matchLabels/dashboards
  #         value: <your-label>
```

- **Ref choice.** `tag: main` tracks every merge (fast); `semver`/`tag: latest`
  track releases only. Reference the tag *only* (no `digest`) or auto-updates stop.
- **Latency.** The only wait is the `OCIRepository` noticing a new digest: its
  `interval`, or ~instant if CI pings a Flux webhook `Receiver`. Everything
  downstream (Kustomization apply → operator sync) is event-driven.
- Make the `o11y-manifests` GHCR package public (like the app images), or set
  `secretRef` on the `OCIRepository`.

## Editing

Edit in Grafana, export (share → JSON), save over the file keeping the `uid`
(the file name must stay `<uid>.json`). CI lints every dashboard with
[dashboard-linter](https://github.com/grafana/dashboard-linter) (`--strict`;
rule exclusions live in `dashboards/.lint`). Alerts are plain
`GrafanaAlertRuleGroup` CRs dropped into `alerts/` (see the Alerts section).
Merge to main → CI pushes
the `:main` artifact → o11y's `OCIRepository` picks it up at its `interval` (or
instantly via webhook). Michael's OTel metrics have dotted names; query them as
`{__name__="http.server.request.count", ...}` (VictoriaMetrics).
