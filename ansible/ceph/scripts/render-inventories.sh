#!/usr/bin/env bash
# render-inventories.sh — write the TF-rendered Ansible inventories + secrets
# templates into THIS checkout, from the dev/ceph stack's `render` output.
#
# WHY a wrapper instead of tofu `local_file`: local_file records the destination
# path in state. With a shared remote backend that path is checkout-specific, so
# it coupled state to whichever git worktree last applied (get_repo_root()
# resolves per-worktree) — every apply elsewhere then force-replaced the files
# and rebound state. Reading the content from a TF *output* and writing it here,
# with the path derived from THIS script's own location, keeps checkout-specific
# paths out of shared state entirely.
#
# Prereq: `terragrunt apply` has been run for the stack (so the `render` output
# reflects the current cluster spec). This script is read-only against state.
#
# Usage (from anywhere):
#   ansible/ceph/scripts/render-inventories.sh [env]     # env defaults to dev
set -euo pipefail

ENVIRONMENT="${1:-dev}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_CEPH="$(cd "$SCRIPT_DIR/.." && pwd)"   # ansible/ceph
REPO_ROOT="$(cd "$ANSIBLE_CEPH/../.." && pwd)" # repo root of THIS checkout
STACK_DIR="$REPO_ROOT/tf/deployment/${ENVIRONMENT}/ceph"
INV_ROOT="$ANSIBLE_CEPH/inventories"

[ -d "$STACK_DIR" ] || {
  echo "render-inventories: stack not found: $STACK_DIR" >&2
  exit 1
}

# The `render` output is non-sensitive (inventory text + op:// references — no
# raw secrets). Reading state needs the S3 backend creds, so go through the
# op-run wrapper which injects them from tf/.env.
JSON="$(cd "$STACK_DIR" && OP_ENV_FILE="$REPO_ROOT/tf/.env" "$REPO_ROOT/tf/op-run.sh" terragrunt output -json render)"

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

echo "render-inventories: done (${ENVIRONMENT})."
