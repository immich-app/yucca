#!/usr/bin/env bash
# Managed by ansible (roles/fluentbit) - do not edit on the node.
#
# Wait for the address fluent-bit binds its HTTP endpoint to before starting it.
# fluent-bit does not check the listener bind result, so if the address is not
# up yet the metrics endpoint is dead for the life of the process.
#
# Usage: fluent-bit-wait-for-bind.sh <address> [timeout-seconds]
set -u

addr="${1:?usage: $0 <address> [timeout-seconds]}"
secs="${2:-60}"

for ((i = 0; i < secs; i++)); do
  if ip -4 -o addr show | grep -qw "$addr"; then
    exit 0
  fi
  sleep 1
done

# Deliberately exit 0. Logs ship over the NetBird overlay and do not need this
# address, so a fabric problem must not stop log shipping for a metrics-only
# dependency. The endpoint stays down and the role's health check fails the next
# converge, which is the same signal as before this wait existed.
echo "fluent-bit: $addr absent after ${secs}s, metrics endpoint will not bind" >&2
exit 0
