# Runbook: Remote Hands Access

**When:** a remote-hands operator (on-site at the datacenter) needs to
run playbooks against the cluster.

**Time estimate:** 10 minutes of setup per operator, one-time. 5 minutes
per remote-hands session after that.

---

## The access model

Remote-hands operators don't touch 1P desktop sessions. They authenticate
via a scoped service-account token, set as `OP_SERVICE_ACCOUNT_TOKEN` in
their shell environment. `scripts/ansible-play.sh` picks it up automatically
and uses it to resolve `secrets.yml.tpl`.

Which SA: the **read-only** `yucca_futo_1pass_service_account` in
`yucca_tf_dev`. Remote hands shouldn't have write access to 1P items —
least-privilege principle.

## One-time setup (per operator)

1. **Grant the operator access to the Immich 1P group** — the group's
   1P admin does this. Gives them read on `yucca_tf_dev` (enough to read
   the SA token and SSH key items).
2. **Operator retrieves the SA token**:
   ```bash
   op read "op://yucca_tf_dev/yucca_futo_1pass_service_account/password"
   ```
3. **Operator sets it in their shell profile** (`~/.bashrc` or equivalent):
   ```bash
   export OP_SERVICE_ACCOUNT_TOKEN="ops_eyJ...."  # 862-char token
   ```
4. **Operator clones yucca**, installs mise tooling, runs:
   ```bash
   cd ~/yucca/ansible/ceph
   mise trust && mise run setup
   ```
5. **Operator installs the ansible-iac SSH keys** from 1P:
   ```bash
   scripts/install-ssh-keys.sh
   ```
   Lands `~/.ssh/id_ed25519_sietch` and `~/.ssh/id_ed25519_painbox` (0600).
6. **Verify**:
   ```bash
   mise run preflight  # should pass; no desktop 1P required
   ```

## Per-session workflow

```bash
cd ~/yucca/ansible/ceph
export CEPH_ENV=inventories/sietch-ceph.dev.austin.int/inventory.ini
mise run status         # read-only smoke test
mise run deploy         # or any other task
```

No auth prompts — the SA token in env gets picked up by `op inject` inside
`scripts/ansible-play.sh`.

## What remote hands CAN'T do

The read-only SA token can't:
- Modify 1P items (e.g., rotate secrets).
- Run `tf:apply` (needs superuser SA for writes).

Actions requiring writes must route through the primary operator or
come with explicit superuser-token provisioning.

## Rotation

If a remote-hands operator leaves the project, rotate the read-only SA
token (see `rotate-sa-token.md`). Their environment still holds the old
token but it's invalidated in 1P; the next command fails loudly.

## References

- `tf/README.md` §"Where secrets actually live" — SA scopes
- `docs/secrets.md` — full secrets model
