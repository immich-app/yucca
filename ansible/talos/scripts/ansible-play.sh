#!/usr/bin/env bash
# ansible-play.sh — secrets-resolving wrapper around ansible-playbook for
# the talos subtree. Mirrors ansible/ceph/scripts/ansible-play.sh but
# treats the secrets.yml.tpl file as optional — present when TF has
# rendered it (with `op://` references), absent otherwise.
#
# When secrets.yml.tpl is present:
#   - Fails fast if no 1P session is available
#   - Renders the template via `op inject` into a short-lived tmpfile
#     (mode 600, trap-cleaned on EXIT/INT/TERM)
#   - Execs ansible-playbook with --extra-vars @tmpfile
#
# When secrets.yml.tpl is absent:
#   - Skips the op-inject step entirely
#   - Execs ansible-playbook directly (no --extra-vars injection)
#
# Usage:
#   TALOS_ENV=inventories/<cluster>/inventory.ini scripts/ansible-play.sh <playbook.yml> [ansible args...]
#
# Environment:
#   TALOS_ENV                     required — path to inventory.ini for the target cluster
#   OP_SERVICE_ACCOUNT_TOKEN      optional — CI headless auth (else op desktop session)
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
  # Secrets path: render template via op inject.
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
  # No-secrets path: skip op inject entirely.
  exec ansible-playbook -i "$TALOS_ENV" "$@"
fi
