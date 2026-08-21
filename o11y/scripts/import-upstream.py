#!/usr/bin/env python3
"""Import upstream Grafana dashboards into o11y/dashboards, normalized to the
bundle's conventions: uid = file name, a `$datasource` variable instead of the
export-time DS_* input, and a `$cluster` variable injected into every PromQL
selector so multi-cluster data at o11y stays separated. Re-run to refresh from
upstream; local edits to imported dashboards are overwritten.
"""

import io
import json
import pathlib
import re
import sys
import urllib.request

DASHBOARDS_DIR = pathlib.Path(__file__).resolve().parent.parent / "dashboards"

CILIUM_VERSION = "v1.19.5"  # tf/deployment/prod/htz-fsn1/talos/clusters.auto.tfvars
DOTDC = "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards"
CILIUM = f"https://raw.githubusercontent.com/cilium/cilium/{CILIUM_VERSION}/install/kubernetes/cilium/files"

# uid -> (url, title, inject cluster var+matchers, anchor metric for the
# cluster variable, extra tags, drop panels whose exprs match)
IMPORTS = {
    "yucca-k8s-global": (f"{DOTDC}/k8s-views-global.json", "Kubernetes / Views / Global", False, None, ["kubernetes"], None),
    "yucca-k8s-namespaces": (f"{DOTDC}/k8s-views-namespaces.json", "Kubernetes / Views / Namespaces", False, None, ["kubernetes"], None),
    "yucca-k8s-nodes": (f"{DOTDC}/k8s-views-nodes.json", "Kubernetes / Views / Nodes", False, None, ["kubernetes"], None),
    "yucca-k8s-pods": (f"{DOTDC}/k8s-views-pods.json", "Kubernetes / Views / Pods", False, None, ["kubernetes"], None),
    "yucca-k8s-apiserver": (f"{DOTDC}/k8s-system-api-server.json", "Kubernetes / System / API Server", False, None, ["kubernetes"], None),
    "yucca-k8s-coredns": (f"{DOTDC}/k8s-system-coredns.json", "Kubernetes / System / CoreDNS", False, None, ["kubernetes"], None),
    "yucca-cilium": (f"{CILIUM}/cilium-agent/dashboards/cilium-dashboard.json", "Cilium / Agent", True, "cilium_version", ["cilium"], None),
    "yucca-cilium-operator": (f"{CILIUM}/cilium-operator/dashboards/cilium-operator-dashboard.json", "Cilium / Operator", True, "cilium_operator_process_cpu_seconds_total", ["cilium"], None),
    "yucca-hubble": (f"{CILIUM}/hubble/dashboards/hubble-dashboard.json", "Cilium / Hubble", True, "hubble_flows_processed_total", ["cilium"], re.compile(r"hubble_http_")),
    "yucca-node-exporter": ("https://raw.githubusercontent.com/rfmoz/grafana-dashboards/master/prometheus/node-exporter-full.json", "Node Exporter / Full", True, "node_uname_info", ["nodes"], None),
    "yucca-flux": ("https://raw.githubusercontent.com/fluxcd/flux2-monitoring-example/main/monitoring/configs/dashboards/cluster.json", "Flux / Cluster", True, "gotk_reconcile_duration_seconds_count", ["flux"], None),
    "yucca-flux-controllers": ("https://raw.githubusercontent.com/fluxcd/flux2-monitoring-example/main/monitoring/configs/dashboards/control-plane.json", "Flux / Control Plane", True, "gotk_reconcile_duration_seconds_count", ["flux"], None),
    "yucca-cnpg": ("https://raw.githubusercontent.com/cloudnative-pg/grafana-dashboards/main/charts/cluster/grafana-dashboard.json", "CloudNativePG", True, "cnpg_collector_up", ["postgres"], None),
    "yucca-vmagent": ("https://raw.githubusercontent.com/VictoriaMetrics/VictoriaMetrics/master/dashboards/vmagent.json", "VictoriaMetrics / vmagent", True, 'vm_app_version{version=~"^vmagent.*"}', ["telemetry"], None),
}

# The CNPG dashboard already uses `$cluster` for the CNPG Cluster resource, so
# the infra-cluster variable gets a different name there.
CLUSTER_VAR_OVERRIDE = {"yucca-cnpg": "k8s_cluster"}


def query_var(d, name, query, regex=""):
    for v in d["templating"]["list"]:
        if v.get("name") == name:
            v["query"] = {"query": query, "refId": "StandardVariableQuery"}
            v["definition"] = query
            v["regex"] = regex
            return
    raise KeyError(name)


def tweak_cnpg(d):
    """Our vmagent overwrites the `cluster` label with the infra cluster name
    (verified live: father's cnpg series carry no exported_cluster), so the
    upstream vars that regex CNPG cluster names out of series strings resolve
    to father/luke and match nothing. Re-derive them from pod names, then
    append a Backups row for the Barman Cloud plugin signals the yucca-database
    alert group (o11y/alerts/database.yaml) fires on."""
    query_var(d, "namespace", 'label_values(cnpg_collector_up{cluster=~"$k8s_cluster"}, namespace)')
    query_var(
        d,
        "cluster",
        'label_values(cnpg_collector_up{cluster=~"$k8s_cluster", namespace=~"$namespace"}, pod)',
        regex="/(?<value>.+)-[0-9]+$/",
    )
    query_var(
        d,
        "instances",
        'label_values(cnpg_collector_up{cluster=~"$k8s_cluster", namespace=~"$namespace", pod=~"$cluster-[0-9]+"}, pod)',
    )

    sel = 'cluster=~"$k8s_cluster", namespace=~"$namespace", pod=~"$cluster-[0-9]+"'
    y = max((p["gridPos"]["y"] + p["gridPos"]["h"]) for p in d["panels"] if "gridPos" in p)
    ids = 9000

    def ds():
        return {"uid": "$datasource"}

    def stat(title, expr, x, w, thresholds, unit="s", description=None):
        nonlocal ids
        ids += 1
        p = {
            "datasource": ds(),
            "fieldConfig": {
                "defaults": {
                    "color": {"mode": "thresholds"},
                    "mappings": [],
                    "thresholds": {"mode": "absolute", "steps": thresholds},
                    "unit": unit,
                },
                "overrides": [],
            },
            "gridPos": {"h": 5, "w": w, "x": x, "y": y + 1},
            "id": ids,
            "options": {
                "colorMode": "value",
                "graphMode": "area",
                "justifyMode": "auto",
                "orientation": "auto",
                "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                "textMode": "auto",
                "wideLayout": True,
            },
            "targets": [{"datasource": ds(), "refId": "A", "expr": expr}],
            "title": title,
            "type": "stat",
        }
        if description:
            p["description"] = description
        return p

    def ts(title, targets, x, w, unit="short"):
        nonlocal ids
        ids += 1
        return {
            "datasource": ds(),
            "fieldConfig": {
                "defaults": {
                    "color": {"mode": "palette-classic"},
                    "custom": {
                        "axisCenteredZero": False,
                        "axisPlacement": "auto",
                        "drawStyle": "line",
                        "fillOpacity": 10,
                        "gradientMode": "none",
                        "lineInterpolation": "linear",
                        "lineWidth": 2,
                        "pointSize": 5,
                        "scaleDistribution": {"type": "linear"},
                        "showPoints": "never",
                        "spanNulls": True,
                        "stacking": {"group": "A", "mode": "none"},
                        "thresholdsStyle": {"mode": "off"},
                    },
                    "mappings": [],
                    "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": 0}]},
                    "unit": unit,
                },
                "overrides": [],
            },
            "gridPos": {"h": 8, "w": w, "x": x, "y": y + 6},
            "id": ids,
            "options": {
                "legend": {"calcs": ["lastNotNull"], "displayMode": "table", "placement": "bottom", "showLegend": True},
                "tooltip": {"mode": "multi", "sort": "desc"},
            },
            "targets": targets,
            "title": title,
            "type": "timeseries",
        }

    def tgt(expr, ref="A", legend=None):
        t = {"datasource": ds(), "refId": ref, "expr": expr}
        if legend:
            t["legendFormat"] = legend
        return t

    ids += 1
    d["panels"].append(
        {"collapsed": False, "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "id": ids, "panels": [], "title": "Backups (Barman Cloud)", "type": "row"}
    )
    d["panels"].append(
        stat(
            "Last base backup age",
            f"time() - max(cnpg_collector_last_available_backup_timestamp{{{sel}}})",
            0,
            6,
            [{"color": "green", "value": 0}, {"color": "yellow", "value": 93600}, {"color": "red", "value": 172800}],
            description="Schedule is daily; a value of ~forever means no base backup has ever succeeded.",
        )
    )
    d["panels"].append(
        stat(
            "PITR window (first recoverability point age)",
            f"time() - max(cnpg_collector_first_recoverability_point{{{sel}}})",
            6,
            6,
            [{"color": "red", "value": 0}, {"color": "yellow", "value": 86400}, {"color": "green", "value": 604800}],
        )
    )
    d["panels"].append(
        stat(
            "Last failed backup age",
            f"time() - max(cnpg_collector_last_failed_backup_timestamp{{{sel}}})",
            12,
            6,
            [{"color": "red", "value": 0}, {"color": "green", "value": 93600}],
            description="Red while the most recent failure is fresher than the daily schedule.",
        )
    )
    d["panels"].append(
        stat(
            "WAL segments awaiting archive",
            f'max(cnpg_collector_pg_wal_archive_status{{value="ready", {sel}}})',
            18,
            6,
            [{"color": "green", "value": 0}, {"color": "yellow", "value": 1}, {"color": "red", "value": 3}],
            unit="short",
            description="Sustained queue = WAL archiving to RGW is broken and the PITR window stops advancing.",
        )
    )
    d["panels"].append(
        ts(
            "WAL archive status",
            [tgt(f"sum by (value) (cnpg_collector_pg_wal_archive_status{{{sel}}})", "A", "{{value}}")],
            0,
            12,
        )
    )
    d["panels"].append(
        ts(
            "WAL generation",
            [
                tgt(f"sum(rate(cnpg_collector_wal_bytes{{{sel}}}[$__rate_interval]))", "A", "bytes/s"),
            ],
            12,
            12,
            unit="Bps",
        )
    )


def tweak_flux_control_plane(d):
    query_var(d, "namespace", 'label_values(workqueue_work_duration_seconds_count{cluster=~"$cluster"}, namespace)')


TWEAKS = {"yucca-cnpg": tweak_cnpg, "yucca-flux-controllers": tweak_flux_control_plane}


def inject_cluster(expr, var):
    """Append cluster=~"$var" to every label-matcher block in a PromQL
    expression, tracking quoted strings so regex quantifiers like {5} inside
    label values are left alone."""
    out = io.StringIO()
    i, n = 0, len(expr)
    in_str = None
    while i < n:
        c = expr[i]
        if in_str:
            out.write(c)
            if c == "\\":
                if i + 1 < n:
                    out.write(expr[i + 1])
                    i += 1
            elif c == in_str:
                in_str = None
            i += 1
            continue
        if c in "\"'":
            in_str = c
            out.write(c)
            i += 1
            continue
        if c == "{":
            j, depth, s = i + 1, 0, None
            while j < n:
                cj = expr[j]
                if s:
                    if cj == "\\":
                        j += 1
                    elif cj == s:
                        s = None
                elif cj in "\"'":
                    s = cj
                elif cj == "}" and depth == 0:
                    break
                j += 1
            body = expr[i + 1 : j]
            if re.search(r'(^|[,{\s(])cluster\s*(=~|!~|!=|=)', body):
                out.write("{" + body + "}")
            elif body.strip():
                out.write("{" + body + ', cluster=~"$' + var + '"}')
            else:
                out.write('{cluster=~"$' + var + '"}')
            i = j + 1
            continue
        out.write(c)
        i += 1
    return out.getvalue()


def walk_datasources(node, old_names):
    if isinstance(node, dict):
        ds = node.get("datasource")
        if isinstance(ds, dict) and any(f"${{{o}}}" == ds.get("uid") or f"${o}" == ds.get("uid") for o in old_names):
            node["datasource"] = {"uid": "$datasource"}
        elif isinstance(ds, str) and any(o in ds for o in old_names):
            node["datasource"] = {"uid": "$datasource"}
        for v in node.values():
            walk_datasources(v, old_names)
    elif isinstance(node, list):
        for v in node:
            walk_datasources(v, old_names)


def walk_exprs(node, fn):
    if isinstance(node, dict):
        if isinstance(node.get("expr"), str):
            node["expr"] = fn(node["expr"])
        for v in node.values():
            walk_exprs(v, fn)
    elif isinstance(node, list):
        for v in node:
            walk_exprs(v, fn)


def panel_exprs(panel):
    return " ".join(t.get("expr", "") for t in panel.get("targets", []) if isinstance(t, dict))


def prune_panels(panels, pattern):
    kept = []
    for p in panels:
        if pattern.search(panel_exprs(p)):
            continue
        if p.get("panels"):
            p["panels"] = prune_panels(p["panels"], pattern)
        kept.append(p)
    return kept


def process(uid, url, title, inject, anchor, tags, drop):
    raw = urllib.request.urlopen(url, timeout=30).read().decode()
    d = json.loads(raw)

    ds_vars = [v["name"] for v in d.get("templating", {}).get("list", []) if v.get("type") == "datasource"]
    d.setdefault("templating", {})["list"] = [v for v in d["templating"]["list"] if v.get("type") != "datasource"]
    d["templating"]["list"].insert(
        0,
        {
            "name": "datasource",
            "type": "datasource",
            "query": "prometheus",
            "label": "Datasource",
            "current": {"selected": True, "text": "VictoriaMetrics Fleet", "value": "VictoriaMetricsFleet"},
            "options": [],
            "refresh": 1,
            "regex": "/^VictoriaMetrics Fleet$/",
            "hide": 0,
        },
    )
    walk_datasources(d, ds_vars + ["datasource"])
    for v in d["templating"]["list"]:
        if v.get("type") == "query":
            v["datasource"] = {"uid": "$datasource"}

    if drop:
        d["panels"] = prune_panels(d.get("panels", []), drop)

    if inject:
        var = CLUSTER_VAR_OVERRIDE.get(uid, "cluster")
        d["templating"]["list"].insert(
            1,
            {
                "name": var,
                "type": "query",
                "label": "Cluster",
                "datasource": {"uid": "$datasource"},
                "query": f"label_values({anchor}, cluster)",
                "definition": f"label_values({anchor}, cluster)",
                "current": {},
                "options": [],
                "refresh": 2,
                "regex": "",
                "sort": 1,
                "includeAll": False,
                "multi": False,
                "hide": 0,
            },
        )
        walk_exprs(d, lambda e: inject_cluster(e, var))
        for v in d["templating"]["list"]:
            if v.get("type") == "query" and v["name"] != var:
                q = v.get("query")
                if isinstance(q, str):
                    v["query"] = inject_cluster(q, var)
                elif isinstance(q, dict) and isinstance(q.get("query"), str):
                    q["query"] = inject_cluster(q["query"], var)
                if isinstance(v.get("definition"), str):
                    v["definition"] = inject_cluster(v["definition"], var)

    def strip_empty_targets(node):
        if isinstance(node, dict):
            if isinstance(node.get("targets"), list):
                node["targets"] = [t for t in node["targets"] if not (isinstance(t, dict) and t.get("expr") == "")]
            for v in node.values():
                strip_empty_targets(v)
        elif isinstance(node, list):
            for v in node:
                strip_empty_targets(v)

    strip_empty_targets(d)
    if uid in TWEAKS:
        TWEAKS[uid](d)

    d["uid"] = uid
    d["title"] = title
    d["tags"] = sorted(set(["yucca", "imported"] + tags))
    d["description"] = f"Imported from {url} by o11y/scripts/import-upstream.py; local edits are overwritten on re-import."
    d["editable"] = True
    for k in ("__inputs", "__requires", "__elements", "id", "iteration"):
        d.pop(k, None)

    out = DASHBOARDS_DIR / f"{uid}.json"
    out.write_text(json.dumps(d, indent=2, sort_keys=False) + "\n")
    print(f"{out.name}: {len(d.get('panels', []))} panels")


def main():
    only = set(sys.argv[1:])
    for uid, spec in IMPORTS.items():
        if only and uid not in only:
            continue
        process(uid, *spec)


if __name__ == "__main__":
    main()
