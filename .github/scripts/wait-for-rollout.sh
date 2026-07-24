#!/usr/bin/env bash
# wait-for-rollout.sh — block until a cluster reports the given commit rolled
# out, using the commit statuses its notification-controller posts back to
# GitHub (kubernetes/apps/<partition>/<region>/flux-system/notifications.yaml).
# This keeps the pipeline pull-based: CI observes GitHub, never the cluster.
#
# Usage: wait-for-rollout.sh <status-prefix> <sha> [timeout-seconds]
#   status-prefix  the cluster's commitStatusExpr prefix: staging | prod-htz-fsn1
#
# Caveat: a Kustomization can post green for a sha moments before the image
# ConfigMap flip reaches its HelmRelease, so "all green" is necessary but not
# sufficient proof the new build is serving — the per-environment test suites
# own the version assertion. The initial sleep gives source-controller and the
# image automation a beat so we rarely read that stale green.
set -euo pipefail

PREFIX="${1:?usage: wait-for-rollout.sh <status-prefix> <sha> [timeout-seconds]}"
SHA="${2:?missing sha}"
TIMEOUT="${3:-1500}"

# The per-app Flux Kustomizations (components/apps/*.yaml) carry healthChecks
# on their HelmReleases, so their green covers workload health; cluster-apps
# covers the rest of the tree.
CONTEXTS=(cluster-apps yucca-api yucca-admin-api yucca-metrics-worker yucca-web michael yucca-database)

deadline=$(($(date +%s) + TIMEOUT))
sleep 90

while :; do
  # /statuses lists newest-first; keep the first (latest) state per context.
  declare -A state=()
  while read -r ctx st; do
    [[ -n "${state[$ctx]:-}" ]] || state[$ctx]="$st"
  done < <(gh api --paginate "repos/${GITHUB_REPOSITORY}/commits/${SHA}/statuses" \
    --jq '.[] | "\(.context) \(.state)"')

  pending=() failed=()
  for c in "${CONTEXTS[@]}"; do
    ctx="${PREFIX}/kustomization/${c}"
    case "${state[$ctx]:-missing}" in
      success) ;;
      failure | error) failed+=("$ctx") ;;
      *) pending+=("$ctx") ;;
    esac
  done

  if [[ ${#pending[@]} -eq 0 && ${#failed[@]} -eq 0 ]]; then
    echo "✅ ${PREFIX}: all contexts green for ${SHA}"
    exit 0
  fi

  # A ❌ mid-rollout is often transient (health checks while pods roll), so we
  # keep polling until the deadline instead of failing fast.
  if (($(date +%s) >= deadline)); then
    echo "::error::timed out waiting for ${PREFIX} rollout of ${SHA} — pending: [${pending[*]:-none}] failed: [${failed[*]:-none}]"
    exit 1
  fi
  echo "waiting on ${PREFIX} — pending: [${pending[*]:-none}] failed: [${failed[*]:-none}]"
  unset state
  sleep 20
done
