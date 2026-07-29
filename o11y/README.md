# o11y/

Everything yucca ships to the o11y cluster, packaged as grafana-operator CRs
inside a single OCI artifact on GHCR: `dashboards/` (Grafana dashboard JSON,
rendered into `GrafanaDashboard` CRs) and `alerts/` (`GrafanaAlertRuleGroup`
CRs, authored directly; none yet). o11y applies the bundle with a Flux
`OCIRepository` + `Kustomization`; its grafana-operator renders the embedded
JSON.

## The set

Every series at o11y carries `cluster` (`father` k8s / `spice` ceph / `netops`
fabric tier / `luke` staging), `site`, `env`. Each dashboard uses a
`$datasource` variable — no datasource UIDs are baked in. Dashboards with logs
panels additionally use a `$logs_datasource` variable (the VictoriaLogs grafana
datasource); log lines carry the same `cluster`/`site`/`env` fields, stamped by
victoria-logs-collector.

| File (= uid) | Covers | Source metrics |
| --- | --- | --- |
| `yucca-overview.json` | Single pane of glass: backup data plane + platform | michael OTLP, `ceph_rgw_*`, cadvisor, PVCs, coredns |
| `yucca-michael.json` | Restic gateway deep dive: HTTP + S3 backend pool + logs | `http.server.request.*`, `s3.backend.*` (OTel, dotted names), VictoriaLogs |
| `yucca-top-users.json` | Fleet-wide top talkers: storage, traffic, stale backups per user (rows link to the per-user board) | `rgw_repository_*`, `blobs.*`, `user_last_*` (all keyed by user id) |
| `yucca-per-user.json` | Single-user drill-down: storage, backup health, traffic, logs. Deep-linkable as `/d/yucca-per-user?var-user=<id>` (`yuctl users view-dashboard`) | `rgw_repository_*`, `blobs.*`, `user_*`, VictoriaLogs |
| `yucca-spice-rgw-capacity.json` | RGW/pool capacity, S3 perf, OSD/BlueStore internals | `ceph_pool_*`, `ceph_rgw_*`, `ceph_osd_*`, `node_*` |
| `yucca-spice-ceph-health.json` | Cluster health: quorum, OSDs, PGs, recovery, latency | `ceph_health_*`, `ceph_pg_*`, `ceph_osd_*` |
| `yucca-spice-nodes.json` | 48-node fleet hotspots: CPU/mem/disk/fabric VLANs | `node_*` (job `ceph-node-exporter`) |
| `yucca-spice-blockdb-bluefs.json` | block.db headroom: spillover tripwire, per-OSD utilization and growth, BlueFS internals | `ceph_bluefs_*`, `ceph_bluestore_onode_*`, `ceph_osd_metadata` |
| `yucca-father-kubernetes.json` | apiserver, coredns, workloads, PVCs, kubelet | `apiserver_*`, `container_*`, `kubelet_*`, `coredns_*` |
| `yucca-fabric-htz-fsn1.json` | Switch fabric: sFlow 5s rates, NETCONF, BGP, alarms | `sflow_*`, `junos_*` (port of the in-cluster netops board) |
| `yucca-telemetry-pipeline.json` | Is telemetry itself healthy: scrape + remote-write | `up`, `vmagent_remotewrite_*`, `vm_*` |

Per-user metric inventory (used by the two user dashboards): michael counts
bytes moved per user/repository/blob-type (`blobs.*`, labels
`customerId`/`repositoryId`/`type`) and requests per user
(`http.server.request.{count,errors}` carry `customerId`/`repositoryId` on
authenticated requests; the duration/TTFB histograms stay route-scoped),
yucca-metrics-worker gauges authoritative RGW bucket usage every 5 min
(`rgw_repository_*`), yucca-api / admin-api count every request per handler and
customer (`api_request_count`, unsampled even though the request log lines are
sampled), and yucca-api gauges client-reported backup health
(`user_repository_size`, `user_last_*` — labels `user_id`/`repository_id`).
Known gaps: no API-side latency histograms, and nothing scrapes CNPG or the
envoy gateways on father.

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
`GrafanaAlertRuleGroup` CRs dropped into `alerts/`. Merge to main → CI pushes
the `:main` artifact → o11y's `OCIRepository` picks it up at its `interval` (or
instantly via webhook). Michael's OTel metrics have dotted names; query them as
`{__name__="http.server.request.count", ...}` (VictoriaMetrics).
