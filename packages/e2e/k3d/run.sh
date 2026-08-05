#!/usr/bin/env bash
# Run the full e2e suite against the LOCAL k3d/Tilt stack.
#
# orchestration-api is intentionally NOT deployed to k8s — it runs here as a
# separate local process (per design). Everything else (yucca-api, michael,
# mock-oidc, web, db, Ceph) comes from the cluster via kubectl port-forwards.
#
# No /etc/hosts / sudo required:
#   - the jest suite resolves the in-cluster OIDC issuer host via a dns preload
#     (hostmap.cjs); the playwright browser via --host-resolver-rules.
#   - yucca-api's topology must advertise a localhost rest_url, because restic
#     runs on this host (the cluster keeps the in-cluster name for real use).
#     `tilt up` with YUCCA_TOPOLOGY_LOCAL_REST=1 renders that variant up front;
#     otherwise we patch the ConfigMap and restart yucca-api here. Either way
#     the orchestrator discovers everything through the meta pod's well-known
#     pointer, exercising the real discovery chain.
#
# Prereq: mise k3d:up && mise tilt:up   (cluster healthy, context k3d-yucca)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
cd "$ROOT"

[ "$(kubectl config current-context)" = "k3d-yucca" ] || {
  echo "Not on k3d-yucca. Run: mise k3d:up && mise tilt:up" >&2; exit 1; }

PF_PIDS=()
ORCH_PGID=""
cleanup() {
  echo "==> cleanup"
  # Kill only what WE started (a broad pkill would take out the user's own
  # port-forwards). Signal the orchestrator's whole process group: it is a
  # mise->pnpm->ts-node tree, and killing just the head orphans the node process
  # holding :22676, which then breaks the next run.
  [ -n "$ORCH_PGID" ] && kill -- "-$ORCH_PGID" 2>/dev/null || true
  for p in "${PF_PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  # Restore the in-cluster rest_url in the topology. If this run is SIGKILLed
  # the override survives — the next run reapplies + reverts it.
  if [ -n "${ORIG_TOPOLOGY:-}" ]; then
    kubectl -n yucca create configmap yucca-topology --from-literal=topology.json="$ORIG_TOPOLOGY" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1 || true
    kubectl -n yucca rollout restart deploy/yucca-api >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# CI has already built the workspace by this point.
if [ -z "${YUCCA_E2E_PREBUILT:-}" ]; then
  echo "==> build workspace libs (sdk consumed by orchestration-api + the e2e)"
  mise run common:build >/dev/null
  mise run yucca-sdk:orchestration-ui:build >/dev/null
fi

echo "==> port-forward k3d services to the e2e host ports"
kubectl port-forward -n yucca svc/yucca-michael   3010:3010  >/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
kubectl port-forward -n yucca svc/yucca-mock-oidc 8092:8092 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
kubectl port-forward -n yucca svc/yucca-meta      8080:8080 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
# web on :36033 (orchestration-api + the web e2e target) AND :5173 (yucca-api's
# OIDC redirect_uri, which the OIDC callback follows).
kubectl port-forward -n yucca svc/yucca-web      36033:5173 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
kubectl port-forward -n yucca svc/yucca-web       5173:5173 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
# victoria-logs (:9428) so the telemetry e2e can read back structured logs that
# yucca-api ships via OTLP.
kubectl port-forward -n yucca svc/victoria-logs   9428:9428 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)

TOPOLOGY="$(kubectl -n yucca get configmap yucca-topology -o jsonpath='{.data.topology\.json}')"
case "$TOPOLOGY" in
  *yucca-michael*)
    echo "==> e2e-only: topology rest_url -> localhost (restic runs on this host)"
    ORIG_TOPOLOGY="$TOPOLOGY"
    kubectl -n yucca create configmap yucca-topology \
      --from-literal=topology.json="${ORIG_TOPOLOGY//yucca-michael/localhost}" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    kubectl -n yucca rollout restart deploy/yucca-api >/dev/null
    kubectl -n yucca rollout status deploy/yucca-api --timeout=120s >/dev/null
    ;;
  *)
    echo "==> topology already advertises a localhost rest_url — no yucca-api restart needed"
    ;;
esac

# After the case, never before: on the patching path the restart above replaces
# the pod, and a forward opened earlier dies with it.
kubectl port-forward -n yucca svc/yucca-api 3020:3020 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)

if (exec 3<>/dev/tcp/localhost/22676) 2>/dev/null; then
  echo "Something is already listening on :22676 — a leftover orchestration-api?" >&2
  echo "The one we start would fail to bind and the suites would fail on it." >&2
  exit 1
fi

echo "==> launch orchestration-api as a separate local process (:22676)"
# Discovery runs the real chain: meta pod well-known -> /api/meta -> api_root.
# setsid gives it a process group cleanup can reap whole.
FUTO_BACKUPS_WELL_KNOWN_URL="http://localhost:8080/.well-known/yucca.json" \
NODE_OPTIONS="--require $HERE/hostmap.cjs" \
  setsid mise run yucca-sdk:orchestration-api:dev >/tmp/yucca-e2e-orch.log 2>&1 &
ORCH_PGID="$(ps -o pgid= -p $! 2>/dev/null | tr -d ' ')"

wait_for_http() {
  local name="$1" url="$2" want="$3"
  for _ in $(seq 1 90); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' -m2 "$url" 2>/dev/null)" = "$want" ] && return 0
    sleep 1
  done
  echo "timed out waiting for $name at $url" >&2
  tail -40 /tmp/yucca-e2e-orch.log >&2
  return 1
}
wait_for_http yucca-api http://localhost:3020/api/meta 200
# Onboarding status, not just any response: it is the first thing the suites
# call, and only answers once discovery has reached a live yucca-api.
wait_for_http orchestration-api http://localhost:22676/api/yucca/onboarding 200

echo "==> jest e2e (it-works, restic-api, yucca-api, orchestration-api)"
# shellcheck disable=SC1091
source .mise/tasks/restic-api/env
# shellcheck disable=SC1091
source .mise/tasks/yucca-api/env
# One worker per suite file — each scopes itself to its own repositories and
# users. Not tied to core count: these spend most of their time waiting on the
# cluster, so they oversubscribe happily on a 4-core runner.
NODE_OPTIONS="--experimental-vm-modules --require $HERE/hostmap.cjs" \
  pnpm --filter e2e exec jest --maxWorkers=4

echo "==> web e2e (playwright against the k3d web)"
# Config lives in packages/web so @playwright/test resolves from web's deps.
pnpm --filter web exec playwright test --config="$ROOT/packages/web/playwright.k3d.config.ts"

echo "==> ALL E2E PASSED against local k8s"
