#!/usr/bin/env bash
# Renders the cluster's TF-generated secrets.yml.tpl via `op inject` into a
# short-lived tmpfile, then execs ansible-playbook with --extra-vars @tmpfile.
# Fails closed: if op inject exits non-zero or auth is unavailable, ansible
# never runs. Tmpfile is removed on exit via trap (including SIGINT/SIGTERM).
#
# Usage:
#   CEPH_ENV=inventories/<cluster>/inventory.ini scripts/ansible-play.sh <playbook.yml> [ansible args...]
#
# Environment:
#   CEPH_ENV                      required — path to inventory.ini for the target cluster
#   OP_SERVICE_ACCOUNT_TOKEN      optional — CI headless auth (else op desktop session)
set -euo pipefail

: "${CEPH_ENV:?CEPH_ENV must be set to the target cluster inventory.ini}"

if [ ! -f "$CEPH_ENV" ]; then
  echo "ansible-play.sh: inventory not found: $CEPH_ENV" >&2
  echo "  Hint: render it — 'terragrunt apply' in tf/deployment/<partition>/<region>/ceph/, then scripts/render-inventories.sh <partition> <region>." >&2
  exit 1
fi

CEPH_ENV_DIR="$(dirname "$CEPH_ENV")"
TEMPLATE="$CEPH_ENV_DIR/secrets.yml.tpl"

if [ ! -f "$TEMPLATE" ]; then
  echo "ansible-play.sh: secrets template not found: $TEMPLATE" >&2
  echo "  Hint: render it — 'terragrunt apply' in tf/deployment/<partition>/<region>/ceph/, then scripts/render-inventories.sh <partition> <region>." >&2
  exit 1
fi

# Fail early if op session is unavailable — gives a clearer error than op inject.
if ! op account get >/dev/null 2>&1; then
  echo "ansible-play.sh: 1Password session unavailable." >&2
  echo "  Unlock 1Password desktop, or set OP_SERVICE_ACCOUNT_TOKEN for CI." >&2
  exit 2
fi

TMPFILE="$(mktemp --suffix=-secrets.yml)"
chmod 600 "$TMPFILE"
trap 'rm -f "$TMPFILE"' EXIT INT TERM

if ! op inject -f -i "$TEMPLATE" -o "$TMPFILE"; then
  echo "ansible-play.sh: op inject failed. Template: $TEMPLATE" >&2
  exit 3
fi

ansible-playbook -i "$CEPH_ENV" --extra-vars "@$TMPFILE" "$@"
