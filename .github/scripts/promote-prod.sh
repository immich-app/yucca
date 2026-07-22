#!/usr/bin/env bash
# promote-prod.sh — pull-based production promotion. Pins production to a tag
# already built (and auto-validated in staging by the flux-operator
# ResourceSetInputProvider), by committing the pin to git. Flux on the prod
# cluster pulls and applies it — this script NEVER touches the cluster
# (no kubeconfig, no tailnet). Runs only behind the `production` Environment gate.
#
# Usage: promote-prod.sh <tag>
set -euo pipefail

TAG="${1:?usage: promote-prod.sh <tag>}"
FILE="kubernetes/clusters/prod/htz-fsn1/image-versions.yaml"
RELEASE_FILE="kubernetes/clusters/prod/htz-fsn1/flux-release.yaml"

# Pin BOTH halves of the release: the image tag (image-versions ConfigMap) and
# the manifest/chart tree (the flux-release GitRepository tag).
# yq if present, else portable sed on the single line each.
if command -v yq >/dev/null 2>&1; then
  yq -i ".data.YUCCA_IMAGE_TAG = \"${TAG}\"" "$FILE"
  yq -i ".spec.ref.tag = \"${TAG}\"" "$RELEASE_FILE"
else
  sed -i.bak -E "s|^(  YUCCA_IMAGE_TAG:).*|\1 ${TAG}|" "$FILE" && rm -f "$FILE.bak"
  sed -i.bak -E "s|^(    tag:).*|\1 ${TAG}|" "$RELEASE_FILE" && rm -f "$RELEASE_FILE.bak"
fi

if git diff --quiet -- "$FILE" "$RELEASE_FILE"; then
  echo "production already pinned to ${TAG}; nothing to do."
  exit 0
fi

git config user.name "push-o-matic[bot]"
git config user.email "push-o-matic[bot]@users.noreply.github.com"
git add "$FILE" "$RELEASE_FILE"
git commit -m "chore(deploy): promote production -> ${TAG} [skip ci]"
git push origin HEAD:main
echo "✅ production pinned to ${TAG}; Flux will reconcile it in-cluster."
