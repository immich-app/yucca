#!/usr/bin/env bash
# op-run.sh — run a command with secrets from tf/.env via a SINGLE `op run`
# (no extra probe → no extra auth prompts), appending an "unlock 1Password"
# hint on auth failure (locked 1P otherwise dies cryptically downstream).
# Usage (from repo root): tf/op-run.sh <cmd> [args...]; OP_ENV_FILE overrides
# the env file (default tf/.env).
set -uo pipefail

ENV_FILE="${OP_ENV_FILE:-tf/.env}"
[ -f "$ENV_FILE" ] || { echo "op-run: env file not found: $ENV_FILE — run from the repo root." >&2; exit 1; }

# stdout streams live; stderr captured to replay + scan for auth failures.
err="$(mktemp)"
trap 'rm -f "$err"' EXIT

op run --env-file="$ENV_FILE" -- "$@" 2>"$err"
rc=$?
cat "$err" >&2

if [ "$rc" -ne 0 ] && grep -qiE 'authorization (prompt|timeout)|RequestDelegatedSession|error initializing client|connect to 1Password|reading frame length|not signed in|is locked|unlock' "$err"; then
  echo "op-run: 1Password couldn't authorize — unlock the desktop app / approve the CLI prompt, then retry." >&2
fi
exit "$rc"
