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
#   - yucca-api's topology is patched (e2e-only) to a localhost rest_url,
#     because restic runs on this host (the cluster keeps the in-cluster name
#     for real use); the orchestrator discovers everything through the meta
#     pod's well-known pointer, exercising the real discovery chain.
#
# Prereq: mise k3d:up && mise tilt:up   (cluster healthy, context k3d-yucca)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
cd "$ROOT"

[ "$(kubectl config current-context)" = "k3d-yucca" ] || {
  echo "Not on k3d-yucca. Run: mise k3d:up && mise tilt:up" >&2; exit 1; }

PF_PIDS=()
ORCH_PID=""
cleanup() {
  echo "==> cleanup"
  # Kill only what WE started (a broad pkill would take out the user's own
  # port-forwards). The orchestrator is a mise->pnpm->node tree, so also match
  # its exact child command.
  [ -n "$ORCH_PID" ] && kill "$ORCH_PID" 2>/dev/null || true
  pkill -f "pnpm --filter @futo-org/backups-orchestrator-api dev" 2>/dev/null || true
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

echo "==> build workspace libs (sdk consumed by orchestration-api + the e2e)"
mise run common:build >/dev/null
mise run yucca-sdk:orchestration-ui:build >/dev/null

echo "==> port-forward k3d services to the e2e host ports"
kubectl port-forward -n yucca svc/yucca-michael  3010:3010  >/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
kubectl port-forward -n yucca svc/yucca-mock-oidc 8092:8092 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
kubectl port-forward -n yucca svc/yucca-meta      8080:8080 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
# web on :36033 (orchestration-api + the web e2e target) AND :5173 (yucca-api's
# OIDC redirect_uri, which the OIDC callback follows).
kubectl port-forward -n yucca svc/yucca-web      36033:5173 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
kubectl port-forward -n yucca svc/yucca-web      5173:5173  >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
# victoria-logs (:9428) so the telemetry e2e can read back structured logs that
# yucca-api ships via OTLP.
kubectl port-forward -n yucca svc/victoria-logs  9428:9428  >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)

echo "==> e2e-only: topology rest_url -> localhost (restic runs on this host)"
ORIG_TOPOLOGY="$(kubectl -n yucca get configmap yucca-topology -o jsonpath='{.data.topology\.json}')"
kubectl -n yucca create configmap yucca-topology \
  --from-literal=topology.json="${ORIG_TOPOLOGY//yucca-michael/localhost}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n yucca rollout restart deploy/yucca-api >/dev/null
kubectl -n yucca rollout status deploy/yucca-api --timeout=120s >/dev/null
kubectl port-forward -n yucca svc/yucca-api 3020:3020 >>/tmp/yucca-e2e-pf.log 2>&1 & PF_PIDS+=($!)
sleep 5

echo "==> launch orchestration-api as a separate local process (:22676)"
# Discovery runs the real chain: meta pod well-known -> /api/meta -> api_root.
FUTO_BACKUPS_WELL_KNOWN_URL="http://localhost:8080/.well-known/yucca.json" \
NODE_OPTIONS="--require $HERE/hostmap.cjs" \
  mise run yucca-sdk:orchestration-api:dev >/tmp/yucca-e2e-orch.log 2>&1 & ORCH_PID=$!
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m2 http://localhost:22676/ 2>/dev/null)" = "404" ] && break
  sleep 2
done

echo "==> jest e2e (it-works, restic-api, yucca-api, orchestration-api)"
# shellcheck disable=SC1091
source .mise/tasks/restic-api/env
# shellcheck disable=SC1091
source .mise/tasks/yucca-api/env
NODE_OPTIONS="--experimental-vm-modules --require $HERE/hostmap.cjs" \
  pnpm --filter e2e exec jest --runInBand

echo "==> web e2e (playwright against the k3d web)"
# Config lives in packages/web so @playwright/test resolves from web's deps.
pnpm --filter web exec playwright test --config="$ROOT/packages/web/playwright.k3d.config.ts"

echo "==> ALL E2E PASSED against local k8s"
