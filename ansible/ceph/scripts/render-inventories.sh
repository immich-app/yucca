#!/usr/bin/env bash
# Write the TF-rendered Ansible inventories + secrets templates into THIS
# checkout from the ceph stack's `render` output. A wrapper, not tofu
# `local_file`: local_file stores the checkout-specific path in shared state, so
# every apply from another worktree force-replaced the files and rebound state;
# reading the output and deriving the path from this script's location keeps
# checkout paths out of state. Read-only against state; requires a prior
# terragrunt apply. Layout comes from each cluster's `dirname` in the output
# (e.g. staging-austin/sietch); this only locates the partition/region stack.
# Usage: ansible/ceph/scripts/render-inventories.sh [partition=staging] [region=austin]
set -euo pipefail

PARTITION="${1:-staging}"
REGION="${2:-austin}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_CEPH="$(cd "$SCRIPT_DIR/.." && pwd)"   # ansible/ceph
REPO_ROOT="$(cd "$ANSIBLE_CEPH/../.." && pwd)" # repo root of THIS checkout
STACK_DIR="$REPO_ROOT/tf/deployment/${PARTITION}/${REGION}/ceph"
INV_ROOT="$ANSIBLE_CEPH/inventories"

[ -d "$STACK_DIR" ] || {
  echo "render-inventories: stack not found: $STACK_DIR" >&2
  exit 1
}

# `render` output is non-sensitive (op:// refs, no raw secrets), but reading
# state needs the S3 backend creds: go through op-run with the partition's env
# file (prod -> tf/.env.prod, else tf/.env, same split as infra.yml). op run
# resolves refs up front, so a mismatched file fails on the wrong vault.
ENV_FILE="$REPO_ROOT/tf/.env"
if [ "$PARTITION" = "prod" ]; then ENV_FILE="$REPO_ROOT/tf/.env.prod"; fi
JSON="$(cd "$STACK_DIR" && OP_ENV_FILE="$ENV_FILE" "$REPO_ROOT/tf/op-run.sh" terragrunt output -json render)"

# JSON travels via env (RENDER_JSON); the heredoc owns python's stdin (the
# program), so we can't also pipe the data in.
RENDER_JSON="$JSON" python3 - "$INV_ROOT" <<'PY'
import json, os, sys

inv_root = sys.argv[1]
data = json.loads(os.environ["RENDER_JSON"])
for cluster, spec in data.items():
    d = os.path.join(inv_root, spec["dirname"])
    os.makedirs(d, exist_ok=True)
    for fname, content in spec["files"].items():
        p = os.path.join(d, fname)
        os.makedirs(os.path.dirname(p), exist_ok=True)  # fname may include subdirs (e.g. group_vars/all/)
        with open(p, "w") as fh:
            fh.write(content)
        os.chmod(p, 0o644)
        print(f"wrote {p}")
PY

echo "render-inventories: done (${PARTITION}/${REGION})."
