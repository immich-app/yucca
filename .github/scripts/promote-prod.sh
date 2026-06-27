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

# Set data.YUCCA_IMAGE_TAG (yq if present, else portable sed on the one line).
if command -v yq >/dev/null 2>&1; then
  yq -i ".data.YUCCA_IMAGE_TAG = \"${TAG}\"" "$FILE"
else
  sed -i.bak -E "s|^(  YUCCA_IMAGE_TAG:).*|\1 ${TAG}|" "$FILE" && rm -f "$FILE.bak"
fi

if git diff --quiet -- "$FILE"; then
  echo "production already pinned to ${TAG}; nothing to do."
  exit 0
fi

git config user.name "push-o-matic[bot]"
git config user.email "push-o-matic[bot]@users.noreply.github.com"
git add "$FILE"
git commit -m "chore(deploy): promote production -> ${TAG} [skip ci]"
git push origin HEAD:main
echo "✅ production pinned to ${TAG}; Flux will reconcile it in-cluster."
