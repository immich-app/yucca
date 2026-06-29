# Wrapper Scripts

The scripts under `ansible/ceph/scripts/` sit between `mise` tasks and the
underlying CLIs (`ansible-playbook`, `op`, `ssh`). They exist to:

- Keep secrets **out of argv** — `op inject` writes to a file; the file is
  passed as `--extra-vars @<path>`, never expanded inline.
- **Fail closed** — if 1Password is unreachable or the inventory is missing,
  the wrappers exit before invoking ansible. The raw tools' error messages
  degrade silently in these cases.
- Offer **better error messages** — "inventory not found at `<path>` — has
  `tofu apply` been run?" beats "No inventory was parsed".

For the architectural role these scripts play, see
[architecture.md §8](architecture.md).

## Setting `CEPH_ENV`

Two of the three wrappers (`ansible-play.sh`, `preflight.sh`) need `CEPH_ENV`
pointing at the target cluster's `inventory.ini`. Set it however suits you —
export it once per shell, or prefix a single invocation:

```bash
# Export once per shell (recommended for a working session):
export CEPH_ENV=inventories/staging-austin/sietch/inventory.ini
mise run preflight
scripts/ansible-play.sh status.yml

# Or prefix a single invocation:
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini mise run preflight
```

Both forms work, by design. `CEPH_ENV` is deliberately **not** declared in
the `ansible/ceph/.mise.toml` `[env]` block: a value there would override
your shell's value and silently pin every task to the default cluster. By
leaving it out, your exported (or inline-prefixed) value passes straight
through, and each `mise run` task falls back to sietch
(`inventories/staging-austin/sietch/inventory.ini`) only when `CEPH_ENV` is
unset. Calling the scripts directly behaves the same — the wrapper reads
`CEPH_ENV` from the environment.

## Quick reference

| Script                 | What it does                                                                       | Called by                                         |
|------------------------|------------------------------------------------------------------------------------|---------------------------------------------------|
| `ansible-play.sh`      | Render `secrets.yml.tpl` via `op inject` to a tmpfile, then exec `ansible-playbook`  | Every `mise run` task that runs a playbook         |
| `install-ssh-keys.sh`  | Pull per-cluster ansible-iac SSH keys from 1P into `~/.ssh/`                        | Operator (once per workstation / after rotation)   |
| `preflight.sh`         | Verify TF artifacts, 1P session, SSH reachability, Python on targets                | `mise run preflight`                               |

---

## `ansible-play.sh`

Wrapper around `ansible-playbook` that resolves TF-rendered secrets via
`op inject` and passes them as an ephemeral extra-vars file.

### Synopsis

```
CEPH_ENV=inventories/<partition>-<region>/<cluster>/inventory.ini \
  scripts/ansible-play.sh <playbook.yml> [ansible-playbook args...]
```

### What it does

1. Validates `$CEPH_ENV` is set and the inventory file exists.
2. Derives the secrets template path: `$(dirname $CEPH_ENV)/secrets.yml.tpl`.
3. Verifies `op account get` succeeds (1P desktop session or
   `OP_SERVICE_ACCOUNT_TOKEN`). Fails fast if unavailable.
4. `mktemp`s a tmpfile, `chmod 600`, registers a `trap` to delete it on
   `EXIT INT TERM` (including operator Ctrl-C or SIGKILL'd parents).
5. Runs `op inject -f -i <template> -o <tmpfile>`. Fails if any `op://`
   reference can't be resolved.
6. `exec`s `ansible-playbook -i $CEPH_ENV --extra-vars @<tmpfile> <args>`.

The `exec` means the wrapper process is replaced — the trap still fires via
the shell's EXIT handler on the child's termination.

### Environment

| Variable                    | Required | Purpose                                                         |
|-----------------------------|----------|-----------------------------------------------------------------|
| `CEPH_ENV`                  | yes      | Path to the target cluster's `inventory.ini`                    |
| `OP_SERVICE_ACCOUNT_TOKEN`  | no       | CI headless auth. Falls back to `op` desktop session if unset.  |

### Arguments

Everything after the playbook name is passed to `ansible-playbook` verbatim.
Common patterns:

```bash
scripts/ansible-play.sh baseline.yml --check --diff
scripts/ansible-play.sh deploy-ceph.yml --tags rgw,monitoring
scripts/ansible-play.sh destroy-ceph.yml -e yes_destroy_ceph=true -e destroy_target_domain=staging.austin.int.futo.cloud
```

The destroy playbook requires both safety gates:
- `yes_destroy_ceph=true` — explicit confirmation (otherwise the play refuses to run)
- `destroy_target_domain=<cluster domain>` — must match the inventory's `cluster_domain`. Mismatch aborts the play, guarding against running destroy with the wrong `CEPH_ENV`.

The `mise run destroy` task (in `.mise.toml`) builds these arguments automatically from `CEPH_ENV` and adds an interactive `[y/N]` prompt — prefer it over invoking the wrapper directly.

### Exit codes

| Code | Meaning                                                           |
|------|-------------------------------------------------------------------|
| 0    | ansible-playbook completed successfully                           |
| 1    | Inventory file missing or secrets template missing                |
| 2    | 1Password session unavailable (`op account get` failed)           |
| 3    | `op inject` failed (bad `op://` reference, missing item, etc.)    |
| ≥4   | ansible-playbook's own exit code (unreachable hosts, failed tasks) |

### Examples

```bash
# Standard deploy
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini \
  scripts/ansible-play.sh deploy-ceph.yml

# Dry-run a role via tags
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini \
  scripts/ansible-play.sh site.yml --check --diff --tags baseline

# CI / headless (SA token from env)
OP_SERVICE_ACCOUNT_TOKEN="$(...)" \
  CEPH_ENV=inventories/staging-austin/sietch/inventory.ini \
  scripts/ansible-play.sh status.yml
```

### Related

- [architecture.md §9.2](architecture.md) — deploy data flow
- [secrets.md](secrets.md) — what's in `secrets.yml.tpl`

---

## `install-ssh-keys.sh`

Idempotent installer that pulls per-cluster `ansible-iac` SSH keypairs from
1Password into `~/.ssh/`. For new workstations or after a key rotation.

### Synopsis

```
scripts/install-ssh-keys.sh [cluster...]
```

If no cluster arguments are given, installs keys for every known cluster
(`sietch`).

### What it does

For each target cluster:

1. Resolves the 1P item name: `<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY` in the
   cluster's vault (`yucca_tf_staging` for sietch).
2. Resolves the target filename: `~/.ssh/id_ed25519_<cluster>`.
3. If the key already exists on disk:
   - Compares fingerprints (local vs 1P).
   - **Match** → skip (idempotent re-run).
   - **Mismatch** → refuse to overwrite. Prints the `mv` command the
     operator should run manually. Exit 2.
4. If the key is missing:
   - `umask 077`.
   - Writes `private_key` → `~/.ssh/id_ed25519_<cluster>` (`chmod 600`).
   - Writes `public_key` → `~/.ssh/id_ed25519_<cluster>.pub` (`chmod 644`).
   - Prints the installed key's fingerprint.

### Environment

| Variable                    | Required | Purpose                                                 |
|-----------------------------|----------|---------------------------------------------------------|
| `OP_SERVICE_ACCOUNT_TOKEN`  | no       | CI headless auth. Read-only scope on the cluster's `yucca_tf_*` vault is enough. |

### Arguments

Zero or more cluster short names (`sietch`). With no args, all
known clusters are installed.

### Exit codes

| Code | Meaning                                                          |
|------|------------------------------------------------------------------|
| 0    | All requested keys installed (or already present and matching)   |
| 1    | Unknown cluster name                                             |
| 2    | Fingerprint mismatch — refused to overwrite existing key on disk |

### Examples

```bash
# Install all known keys
scripts/install-ssh-keys.sh

# Just one cluster
scripts/install-ssh-keys.sh sietch

# Re-run after a rotation (operator already moved the old key aside manually)
mv ~/.ssh/id_ed25519_sietch     ~/.ssh/id_ed25519_sietch.20260423.bak
mv ~/.ssh/id_ed25519_sietch.pub ~/.ssh/id_ed25519_sietch.pub.20260423.bak
scripts/install-ssh-keys.sh sietch
```

### Related

- [runbooks/rotate-ssh-key.md](runbooks/rotate-ssh-key.md) — the full rotation flow
- [secrets.md](secrets.md) — why SSH keys live in 1P (durable, auditable, one `op://` model)

---

## `preflight.sh`

Read-only smoke test — verifies the controller environment is ready to run
destructive playbooks against the target cluster. Surfaced via
`mise run preflight`.

### Synopsis

```
CEPH_ENV=inventories/<partition>-<region>/<cluster>/inventory.ini scripts/preflight.sh
```

### What it checks

**Controller:**

- `scripts/ansible-play.sh` is executable
- Inventory file exists (TF-rendered)
- Secrets template exists (TF-rendered)
- SSH private + public keys exist on disk
- `ansible` and `op` CLIs installed
- 1Password session live (`op account get`)

**Secrets:**

- `op inject` resolves the cluster's `secrets.yml.tpl` successfully
- Resolved file has a non-empty `vault_ops_password` line (sanity check
  that op isn't silently substituting empty strings)

**Target connectivity** (one check per host in `ceph_nodes`):

- SSH reachability via `ansible -m ping`
- Python 3 available via `ansible -m raw`

### Environment

| Variable                    | Required | Purpose                                               |
|-----------------------------|----------|-------------------------------------------------------|
| `CEPH_ENV`                  | yes      | Path to the target cluster's `inventory.ini`          |
| `OP_SERVICE_ACCOUNT_TOKEN`  | no       | CI headless auth. Falls back to `op` desktop session. |

### Exit codes

| Code | Meaning                                                                      |
|------|------------------------------------------------------------------------------|
| 0    | All checks passed                                                            |
| 1    | One or more checks failed — summary printed, unsafe to proceed               |

Warnings (non-blocking) are reported in the summary but don't affect exit.

### Examples

```bash
# Via mise (recommended)
mise run preflight

# Direct, against sietch
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini \
  scripts/preflight.sh
```

### Related

- [architecture.md §8](architecture.md) — where the wrappers fit in the system mesh

---

## Adding a new wrapper

Follow these conventions:

1. **Fail closed** — `set -euo pipefail` at the top. Any uncaught error
   aborts the script.
2. **Validate inputs early** — check required env vars (`: "${CEPH_ENV:?...}"`),
   then check that referenced files exist, before doing any real work.
3. **Never interpolate secrets into argv** — write them to a `mktemp`'d
   file (`chmod 600`) and pass the path. Always `trap 'rm -f "$TMP"' EXIT INT TERM`.
4. **Distinct exit codes** — the caller (mise task or another script) should
   be able to tell "inventory missing" from "1P unreachable" from "ansible
   failed" without parsing stderr.
5. **Idempotent where plausible** — re-running the script should not make
   things worse. Prefer skip-if-already-correct over unconditional overwrite.
6. **Cross-reference from [architecture.md §8](architecture.md)** and add a
   section to this file with the same shape as the ones above.
