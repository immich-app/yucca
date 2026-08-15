#!/usr/bin/env bash
# Secrets-resolving ansible-playbook wrapper for the talos subtree. Mirrors
# ansible/ceph/scripts/ansible-play.sh but secrets.yml.tpl is OPTIONAL: when
# present, fail fast without a 1P session, `op inject` into a trap-cleaned 0600
# tmpfile, exec with --extra-vars @tmpfile; when absent, exec directly.
# Usage: TALOS_ENV=inventories/<cluster>/inventory.ini scripts/ansible-play.sh <playbook.yml> [args...]
#   TALOS_ENV required; OP_SERVICE_ACCOUNT_TOKEN optional (CI headless auth).
set -euo pipefail

: "${TALOS_ENV:?TALOS_ENV must be set to the target cluster inventory.ini}"

if [ ! -f "$TALOS_ENV" ]; then
  echo "ansible-play.sh: inventory not found: $TALOS_ENV" >&2
  echo "  Hint: has 'TF_STACK_DIR=tf/deployment/<env>/talos mise run tf:apply' been run?" >&2
  exit 1
fi

TALOS_ENV_DIR="$(dirname "$TALOS_ENV")"
TEMPLATE="$TALOS_ENV_DIR/secrets.yml.tpl"

if [ -f "$TEMPLATE" ]; then
  if ! op account get >/dev/null 2>&1; then
    echo "ansible-play.sh: 1Password session unavailable (secrets template present)." >&2
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

  exec ansible-playbook -i "$TALOS_ENV" --extra-vars "@$TMPFILE" "$@"
else
  exec ansible-playbook -i "$TALOS_ENV" "$@"
fi
