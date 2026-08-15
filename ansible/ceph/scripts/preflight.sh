#!/usr/bin/env bash
# Verifies TF-rendered artifacts are present, the 1P session is live, the secrets
# template resolves via op inject, SSH connectivity, and Python on targets.
#
# Inventory + secrets template are located via CEPH_ENV; cluster identity is
# declared in tf/deployment/<partition>/<region>/ceph/clusters.auto.tfvars.
set -euo pipefail

: "${CEPH_ENV:?CEPH_ENV must be set to the target cluster inventory.ini}"

INV="$CEPH_ENV"
INV_DIR="$(dirname "$CEPH_ENV")"
TEMPLATE="${INV_DIR}/secrets.yml.tpl"

SSH_KEY="$(sed -n 's/^ansible_ssh_private_key_file=\(.*\)/\1/p' "$INV" 2>/dev/null | head -1)"
if [ -z "$SSH_KEY" ]; then
  SSH_KEY="$(sed -n 's/^provision_iac_ssh_key_path:[[:space:]]*//p' \
    "${INV_DIR}/group_vars/all/vars.yml" 2>/dev/null | head -1)"
  SSH_KEY="${SSH_KEY%\"}"
  SSH_KEY="${SSH_KEY#\"}"
fi
SSH_KEY="${SSH_KEY/#\~/$HOME}"

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"; shift
  if "$@" &>/dev/null; then
    echo "  [OK]   $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label"
    FAIL=$((FAIL + 1))
  fi
}

warn() {
  local label="$1"; shift
  if "$@" &>/dev/null; then
    echo "  [OK]   $label"
    PASS=$((PASS + 1))
  else
    echo "  [WARN] $label"
    WARN=$((WARN + 1))
  fi
}

echo "=== Pre-flight checks ==="
echo "Inventory: $INV"
echo "Template:  $TEMPLATE"
echo ""

echo "--- Controller ---"
check "ansible-play.sh wrapper executable" test -x scripts/ansible-play.sh
check "Inventory file (TF-rendered) present" test -f "$INV"
check "Secrets template (TF-rendered) present" test -f "$TEMPLATE"
check "Ceph config (TF-rendered) present" test -f "${INV_DIR}/group_vars/all/ceph-config.generated.yml"
check "SSH private key exists" test -f "$SSH_KEY"
check "SSH public key exists" test -f "${SSH_KEY}.pub"
check "Ansible installed" ansible --version
check "op CLI installed" op --version
check "1Password session live" op account get
echo ""

echo "--- Secrets ---"
SECRETS_TEST="$(mktemp --suffix=-secrets-test.yml)"
trap 'rm -f "$SECRETS_TEST"' EXIT INT TERM
check "op inject resolves template" op inject -f -i "$TEMPLATE" -o "$SECRETS_TEST"
check "Resolved file has non-empty vault_ops_password" \
  grep -qE '^vault_ops_password: \S+' "$SECRETS_TEST"
echo ""

echo "--- Target connectivity ---"
for host in $(ansible-inventory -i "$INV" --list 2>/dev/null \
  | python3 -c "
import sys, json
inv = json.load(sys.stdin)
hosts = inv.get('ceph_nodes', {}).get('hosts', [])
for h in hosts:
    print(h)
" 2>/dev/null); do
  check "SSH to $host" ansible -i "$INV" "$host" -m ping
done
echo ""

echo "--- Target health ---"
for host in $(ansible-inventory -i "$INV" --list 2>/dev/null \
  | python3 -c "
import sys, json
inv = json.load(sys.stdin)
hosts = inv.get('ceph_nodes', {}).get('hosts', [])
for h in hosts:
    print(h)
" 2>/dev/null); do
  check "Python on $host" ansible -i "$INV" "$host" -m raw -a "python3 --version" -b
done
echo ""

echo "=== Results ==="
echo "  Passed: $PASS  Failed: $FAIL  Warnings: $WARN"
if [ "$FAIL" -gt 0 ]; then
  echo "  Pre-flight FAILED: fix issues above before proceeding."
  exit 1
else
  echo "  Pre-flight OK: safe to proceed."
fi
