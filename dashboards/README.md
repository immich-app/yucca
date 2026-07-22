# dashboards/

Grafana dashboards for everything yucca ships to o11y, distributed as a single
OCI artifact on GHCR and imported by o11y's grafana-operator.

## The set

Every series at o11y carries `cluster` (`father` k8s / `spice` ceph / `netops`
fabric tier / `luke` staging), `site`, `env`. Each dashboard uses a
`$datasource` variable — no datasource UIDs are baked in.

| File (= uid) | Covers | Source metrics |
| --- | --- | --- |
| `yucca-overview.json` | Single pane of glass: backup data plane + platform | michael OTLP, `ceph_rgw_*`, cadvisor, PVCs, coredns |
| `yucca-michael.json` | Restic gateway deep dive: HTTP + S3 backend pool | `http.server.request.*`, `s3.backend.*` (OTel, dotted names) |
| `spice-rgw-capacity.json` | RGW/pool capacity, S3 perf, OSD/BlueStore internals | `ceph_pool_*`, `ceph_rgw_*`, `ceph_osd_*`, `node_*` |
| `spice-ceph-health.json` | Cluster health: quorum, OSDs, PGs, recovery, latency | `ceph_health_*`, `ceph_pg_*`, `ceph_osd_*` |
| `spice-nodes.json` | 48-node fleet hotspots: CPU/mem/disk/fabric VLANs | `node_*` (job `ceph-node-exporter`) |
| `father-kubernetes.json` | apiserver, coredns, workloads, PVCs, kubelet | `apiserver_*`, `container_*`, `kubelet_*`, `coredns_*` |
| `fabric-htz-fsn1.json` | Switch fabric: sFlow 5s rates, NETCONF, BGP, alarms | `sflow_*`, `junos_*` (port of the in-cluster netops board) |
| `yucca-telemetry-pipeline.json` | Is telemetry itself healthy: scrape + remote-write | `up`, `vmagent_remotewrite_*`, `vm_*` |

Known gaps (metrics that do not exist yet, so no dashboard): yucca-api /
admin-api / metrics-worker emit no OTLP app metrics today (only michael does),
and nothing scrapes CNPG or the envoy gateways on father.

## Distribution contract

CI (`.github/workflows/dashboards.yml`) validates every file (`uid` == file
name) and pushes ONE artifact with each dashboard as a layer:

```
ghcr.io/immich-app/yucca/dashboards:0.0.<run>   # immutable build tag
ghcr.io/immich-app/yucca/dashboards:sha-<sha>   # immutable
ghcr.io/immich-app/yucca/dashboards:latest      # moving; operator re-fetches on resync
```

Artifact type `application/vnd.grafana.dashboard+json`, pushed with `oras`.

## Importing on o11y

One `GrafanaDashboard` per file, same reference, per-file `path`:

```yaml
apiVersion: grafana.integreatly.org/v1beta1
kind: GrafanaDashboard
metadata:
  name: yucca-michael
spec:
  instanceSelector:
    matchLabels:
      dashboards: grafana
  resyncPeriod: 10m
  oci:
    reference: ghcr.io/immich-app/yucca/dashboards:latest
    path: yucca-michael.json
    # pullSecretRef: {name: ghcr-pull}   # only if the GHCR package stays private
```

Make the `dashboards` GHCR package public (like the app images) or provide a
pull secret.

## Editing

Edit in Grafana, export (share → JSON), save over the file keeping the `uid`
(the file name must stay `<uid>.json`). Merge to main → CI pushes → o11y picks
it up within a resync period. Michael's OTel metrics have dotted names — query
them as `{__name__="http.server.request.count", ...}` (VictoriaMetrics).
