#!/usr/bin/env bash
# op-run.sh — run a command with secrets injected from tf/.env via 1Password,
# adding a clear, actionable hint when 1Password can't authorize.
#
# A locked/dismissed 1Password otherwise surfaces as a buried `op` error or
# (via `op read` in $()) silently-empty creds, leaving the wrapped tool to die
# cryptically (terragrunt: "No valid credential sources found"). This wrapper
# runs a SINGLE `op run` — no extra probe, so no extra auth prompts — and
# inspects its stderr to append a plain "unlock 1Password and retry" on the
# auth-failure path.
#
# Usage (from repo root): tf/op-run.sh <cmd> [args...]
#   OP_ENV_FILE overrides the env file (default: tf/.env).
set -uo pipefail

ENV_FILE="${OP_ENV_FILE:-tf/.env}"
[ -f "$ENV_FILE" ] || { echo "op-run: env file not found: $ENV_FILE — run from the repo root." >&2; exit 1; }

# stdout streams live; stderr is captured so we can both replay it and scan it
# for 1Password auth failures.
err="$(mktemp)"
trap 'rm -f "$err"' EXIT

op run --env-file="$ENV_FILE" -- "$@" 2>"$err"
rc=$?
cat "$err" >&2

if [ "$rc" -ne 0 ] && grep -qiE 'authorization (prompt|timeout)|RequestDelegatedSession|error initializing client|connect to 1Password|reading frame length|not signed in|is locked|unlock' "$err"; then
  echo "op-run: 1Password couldn't authorize — unlock the desktop app / approve the CLI prompt, then retry." >&2
fi
exit "$rc"
