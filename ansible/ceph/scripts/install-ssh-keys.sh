#!/usr/bin/env bash
# install-ssh-keys.sh — pull ansible-iac SSH keys from 1P into ~/.ssh/
#
# For new operators setting up a fresh workstation, or existing operators
# after a key rotation. Idempotent — skips keys that already exist on disk
# with matching fingerprints.
#
# Prereq: `op` CLI signed in (desktop session unlocked or
# OP_SERVICE_ACCOUNT_TOKEN set). Read-only access to yucca_tf_dev is enough.
#
# Usage:
#   scripts/install-ssh-keys.sh                  # all keys
#   scripts/install-ssh-keys.sh sietch           # one cluster
set -euo pipefail

VAULT="yucca_tf_dev"

# Map: short cluster name -> target filename under ~/.ssh/
declare -A KEYS=(
  [sietch]="id_ed25519_sietch"
  [painbox]="id_ed25519_painbox"
)

if [ $# -eq 0 ]; then
  targets=(sietch painbox)
else
  targets=("$@")
fi

for cluster in "${targets[@]}"; do
  key_name="${KEYS[$cluster]:-}"
  if [ -z "$key_name" ]; then
    echo "unknown cluster: $cluster" >&2
    exit 1
  fi
  priv="$HOME/.ssh/$key_name"
  pub="$priv.pub"
  item="$(echo "$cluster" | tr '[:lower:]' '[:upper:]')_CEPH_ANSIBLE_IAC_SSH_KEY"

  echo "=== $cluster → $priv ==="

  # Compare fingerprints if the key is already on disk
  if [ -f "$priv" ]; then
    disk_fp=$(ssh-keygen -l -f "$priv" 2>/dev/null | awk '{print $2}' || echo "?")
    onep_fp=$(op read "op://$VAULT/$item/public_key" | ssh-keygen -l -f /dev/stdin 2>/dev/null | awk '{print $2}' || echo "?")
    if [ "$disk_fp" = "$onep_fp" ] && [ -n "$disk_fp" ]; then
      echo "  already present, fingerprint matches: $disk_fp"
      continue
    else
      echo "  fingerprint mismatch — disk=$disk_fp  1P=$onep_fp"
      echo "  refusing to overwrite. Move aside manually if you intend to replace:"
      echo "    mv $priv $priv.$(date +%Y%m%d).bak"
      echo "    mv $pub  $pub.$(date +%Y%m%d).bak"
      exit 2
    fi
  fi

  # Write private + public side by side
  umask 077
  op read "op://$VAULT/$item/private_key" > "$priv"
  op read "op://$VAULT/$item/public_key"  > "$pub"
  chmod 600 "$priv"
  chmod 644 "$pub"
  fp=$(ssh-keygen -l -f "$priv" | awk '{print $2}')
  echo "  installed: $fp"
done

echo ""
echo "Done. Make sure ~/.ssh/config routes these hosts through the keys you just installed"
echo "(or omits IdentityFile so the 1Password SSH Agent can serve them — recommended)."
