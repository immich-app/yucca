#!/usr/bin/env bash
# write-prod-pin.sh — write the prod deploy pin to the CI-owned deploy/prod
# branch. The branch carries kubernetes/pin/prod/ (a manifest-tag pin plus ONE
# image key PER APP), applied in-cluster by the prod-pin Flux Kustomization
# (kubernetes/clusters/prod/htz-fsn1/prod-pin.yaml). Per-app keys are what
# makes rollback surgical: any subset of apps can be re-pointed to any
# previously deployed tag without touching the rest.
#
# Usage:
#   write-prod-pin.sh deploy <tag>              # full pin: manifests + all apps
#   write-prod-pin.sh rollback <tag> <scope>    # scope: all | csv of
#                                               # yucca-api,yucca-admin-api,
#                                               # yucca-metrics-worker,web,
#                                               # michael,manifests
#
# Requires: a checkout with push credentials (the push-o-matic app token).
# History on deploy/prod is append-only — every deploy and rollback is one
# commit, so `git log deploy/prod` is the prod deployment ledger.
set -euo pipefail

MODE="${1:?usage: write-prod-pin.sh <deploy|rollback> <tag> [scope]}"
TAG="${2:?missing tag}"
SCOPE="${3:-all}"
BRANCH=deploy/prod
DIR=kubernetes/pin/prod

declare -A KEYS=(
  [yucca-api]=YUCCA_API_IMAGE_TAG
  [yucca-admin-api]=YUCCA_ADMIN_API_IMAGE_TAG
  [yucca-metrics-worker]=YUCCA_METRICS_WORKER_IMAGE_TAG
  [web]=WEB_IMAGE_TAG
  [michael]=MICHAEL_IMAGE_TAG
)

write_full_pin() {
  mkdir -p "$DIR"
  cat >"$DIR/kustomization.yaml" <<'EOF'
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ./flux-release.yaml
  - ./image-versions.yaml
EOF
  cat >"$DIR/flux-release.yaml" <<EOF
---
# CI-WRITTEN (write-prod-pin.sh) — prod's manifest + chart pin. Do not edit by
# hand; use the Deploy pipeline or the Rollback workflow.
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: flux-release
  namespace: flux-system
spec:
  interval: 1m
  ref:
    tag: ${TAG}
  url: https://github.com/immich-app/yucca.git
EOF
  cat >"$DIR/image-versions.yaml" <<EOF
---
# CI-WRITTEN (write-prod-pin.sh) — prod's image pins, one key per app so
# rollback can be surgical. Do not edit by hand; use the Deploy pipeline or
# the Rollback workflow.
apiVersion: v1
kind: ConfigMap
metadata:
  name: image-versions
  namespace: flux-system
data:
  YUCCA_API_IMAGE_TAG: ${TAG}
  YUCCA_ADMIN_API_IMAGE_TAG: ${TAG}
  YUCCA_METRICS_WORKER_IMAGE_TAG: ${TAG}
  WEB_IMAGE_TAG: ${TAG}
  MICHAEL_IMAGE_TAG: ${TAG}
EOF
}

git config user.name "push-o-matic[bot]"
git config user.email "push-o-matic[bot]@users.noreply.github.com"

for attempt in 1 2 3; do
  if git fetch origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}" 2>/dev/null; then
    git checkout -qB "$BRANCH" "origin/${BRANCH}"
  elif [[ "$MODE" == deploy ]]; then
    # First deploy ever: start the pin branch as an orphan holding only the pin.
    git checkout -q --orphan "$BRANCH"
    git rm -rfq . 2>/dev/null || true
    git clean -fdq
  else
    echo "::error::no ${BRANCH} branch exists yet — nothing to roll back"
    exit 1
  fi

  if [[ "$MODE" == deploy ]]; then
    write_full_pin
  else
    [[ -f "$DIR/image-versions.yaml" ]] || { echo "::error::${DIR} missing on ${BRANCH}"; exit 1; }
    IFS=, read -ra parts <<<"$SCOPE"
    [[ "$SCOPE" == all ]] && parts=(manifests "${!KEYS[@]}")
    for p in "${parts[@]}"; do
      if [[ "$p" == manifests ]]; then
        sed -i -E "s|^(    tag:).*|\1 ${TAG}|" "$DIR/flux-release.yaml"
      else
        key="${KEYS[$p]:?unknown app in scope: $p}"
        sed -i -E "s|^(  ${key}:).*|\1 ${TAG}|" "$DIR/image-versions.yaml"
      fi
    done
  fi

  git add -A "$DIR"
  if git diff --cached --quiet; then
    echo "pin already at desired state; nothing to do"
    exit 0
  fi
  git commit -qm "${MODE}: prod -> ${TAG} (scope: ${SCOPE})"
  if git push origin "HEAD:refs/heads/${BRANCH}"; then
    echo "✅ ${BRANCH} updated — ${MODE} ${TAG} (scope: ${SCOPE}); prod Flux will reconcile it"
    exit 0
  fi
  echo "push raced with a concurrent pin write; retrying (${attempt}/3)"
  git checkout -qf "${GITHUB_SHA:-HEAD}"
  sleep 3
done
echo "::error::could not push ${BRANCH} after 3 attempts"
exit 1
