# Contributing

Developer guide for the ceph Ansible project in the `yucca` monorepo. Read
this before making changes.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [mise](https://mise.jdx.dev/) | latest | `curl https://mise.jdx.dev/install.sh \| sh` |
| Python | 3.12 (managed by mise) | Automatic via `.mise.toml` |
| [1Password CLI](https://developer.1password.com/docs/cli) | v2 | `pacman -S 1password-cli` / `brew install 1password-cli` |
| [shellcheck](https://www.shellcheck.net/) | latest | `pacman -S shellcheck` |
| SSH config | Access to cluster nodes | See below |

### 1Password access

You need read access to the **`yucca_tf_dev`** 1Password vault (Futo team
membership grants this). The `scripts/ansible-play.sh` wrapper uses `op
inject` to resolve secrets at playbook time — desktop session unlock or
`OP_SERVICE_ACCOUNT_TOKEN` satisfies auth. No ansible-vault password to
manage.

### SSH setup

The `ansible-iac` SSH keys live in `yucca_tf_dev` as items like
`SIETCH_CEPH_ANSIBLE_IAC_SSH_KEY` — native 1Password SSH Key items, same
storage model as the cluster passwords, so a lost laptop is a non-event.

**First-time workstation setup:**

```bash
cd yucca/ansible/ceph
scripts/install-ssh-keys.sh    # op read → ~/.ssh/id_ed25519_sietch
```

The script is idempotent and refuses to overwrite an existing key whose
fingerprint doesn't match 1P. Keys land as `~/.ssh/id_ed25519_sietch`
(private + `.pub` both 0600/0644).

**Jump hosts / proxies** belong in your personal `~/.ssh/config`, not in
this repo.

**Recommended:** run the 1Password desktop app's SSH Agent globally
(`Host * IdentityAgent ~/.1password/agent.sock` in `~/.ssh/config`). Keys
are served from 1P; private material never leaves the app. The
inventory's explicit `ansible_ssh_private_key_file` still works as a
fallback.

## First-time setup

```bash
# Clone the monorepo and navigate to this subproject
git clone <yucca-monorepo-url> && cd yucca/ansible/ceph

# Trust the mise config (one-time per checkout)
mise trust
# Bootstrap the dev environment (creates .venv, installs Python deps + Ansible collections)
mise run setup

# Render cluster inventories + secrets templates (run once, or after any
# change to tf/deployment/staging/austin/ceph/clusters.auto.tfvars)
cd ../../tf/deployment/staging/austin/ceph && tofu init && tofu apply && cd -
```

This runs:
1. Creates `.venv/` with Python 3.12
2. `pip install -r requirements.txt` (ansible-core, ansible-lint, yamllint, molecule, boto3)
3. `ansible-galaxy collection install -r requirements.yml` (ansible.posix, community.general)

Verify:

```bash
ansible --version | head -1    # ansible-core 2.20.x
ansible-lint --version         # 26.x
yamllint --version             # 1.38.x
```

## Selecting a cluster

All tooling uses the `CEPH_ENV` variable to select the target cluster.
It points to an **inventory file** (not a directory):

```bash
# Inline prefix — required for `mise run` invocations:
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini mise run preflight
```

**`export CEPH_ENV=...` does NOT work with `mise run`.** mise's `[env]`
block strips shell-exported vars when launching tasks; the wrapper exits
with `CEPH_ENV must be set` even though your shell clearly has it set.
The inline-prefix form passes the var directly into mise's invocation
env where it's preserved. See [docs/scripts.md "Setting CEPH_ENV"](docs/scripts.md)
for the full explanation.

For multiple commands against the same cluster, set a local (non-exported)
shell variable and inline-prefix each invocation:

```bash
CE=inventories/staging-austin/sietch/inventory.ini
CEPH_ENV=$CE mise run preflight
CEPH_ENV=$CE mise run status
CEPH_ENV=$CE mise run deploy
```

Calling scripts directly (e.g., `scripts/preflight.sh`) DOES respect
shell `export` — it's only the `mise run` path that filters the env.

Cluster identity is declared in `tf/deployment/staging/austin/ceph/clusters.auto.tfvars`
(keyed by short cluster name). TF renders the directory name, inventory
file, and secrets template from that entry. `CEPH_ENV` is just a pointer
to the rendered inventory file; wrappers like `scripts/ansible-play.sh`
and the `destroy` mise task extract the cluster name from its path for
convenience:

```
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini
                     ^^^^^^^^^^^^^^ ^^^^^^
                     |              cluster name = sietch          (map key in clusters.auto.tfvars)
                     region slug  = staging-austin                 (<partition>-<region>, rendered by TF)
                     domain        = staging.austin.int.futo.cloud (domain field in tfvars)
```

Running `mise run tf:apply` regenerates `inventories/<cluster>/inventory.ini`
and `secrets.yml.tpl` any time the tfvars entry changes.

## Development workflow

### 1. Edit

Make your changes in `roles/`, playbooks, or inventory files.

### 2. Lint

```bash
mise run lint
```

Runs three linters in sequence:
- **yamllint** -- relaxed profile, 260-char line limit (`.yamllint`)
- **ansible-lint** -- skips `var-naming[no-role-prefix]` because all roles share
  the `ceph_` prefix (`.ansible-lint`)
- **shellcheck** -- all scripts in `scripts/`

### 3. Syntax-check

```bash
mise run check
```

Runs `ansible-playbook --syntax-check` against every playbook using the active
`CEPH_ENV` inventory.

### 4. Re-render inventory (TF)

```bash
mise run tf:apply
```

Re-renders `inventory.ini` and `secrets.yml.tpl` for every cluster declared
in `tf/deployment/staging/austin/ceph/clusters.auto.tfvars`. Required after any cluster-
spec edit.

### 5. Dry-run against real nodes

```bash
scripts/ansible-play.sh baseline.yml --check --diff
```

`--check` simulates changes without applying them. `--diff` shows what would
change. Safe to run against production. Use the wrapper (not bare
`ansible-playbook`) so secrets resolve via `op inject`.

### 6. Test with Molecule

```bash
mise run test
```

Roles with `molecule/` directories get template-rendering verification.
Molecule doesn't converge (requires real hardware) but verifies Jinja2
templates render without errors.

## Code conventions

### FQCN everywhere

Always use fully-qualified collection names for modules:

```yaml
# Good
- name: Install packages
  ansible.builtin.apt:
    name: htop
    state: present

# Bad
- name: Install packages
  apt:
    name: htop
```

### changed_when is required

Every `shell` and `command` task must declare `changed_when`:

```yaml
- name: Check OSD count
  ansible.builtin.shell: |
    set -o pipefail
    ceph osd stat --format json | python3 -c "..."
  args:
    executable: /bin/bash
  register: osd_count
  changed_when: false          # read-only command

- name: Create OSD
  ansible.builtin.shell: ...
  changed_when: "'Created osd' in result.stdout"
```

### Shell task rules

- Always set `args.executable: /bin/bash`
- Always start with `set -o pipefail` (or `set -euo pipefail` for multi-line)
- Use `>` folded style for single-line commands, `|` literal style for
  multi-line:

```yaml
# Single logical command
- name: Check disk
  ansible.builtin.shell: >
    set -euo pipefail;
    pvs /dev/sda 2>/dev/null | grep -q ceph

# Multi-line script
- name: Wait for OSDs
  ansible.builtin.shell: |
    set -o pipefail
    ceph osd stat --format json
  args:
    executable: /bin/bash
```

### Secrets handling

- Use `no_log: true` on any task that handles passwords, keys, or tokens
- Secrets are provisioned in 1Password (see [docs/secrets.md](docs/secrets.md))
  and consumed at playbook time via `scripts/ansible-play.sh`, which runs
  `op inject` on the cluster's `secrets.yml.tpl` and passes resolved values
  as `--extra-vars`.
- In ansible code, reference secrets as regular variables via the existing
  alias pattern in each cluster's `group_vars/all/vars.yml`:

  ```yaml
  # group_vars/all/vars.yml (plaintext, committed)
  ops_password: "{{ vault_ops_password }}"
  ```

  `vault_ops_password` is populated from `op inject` — no ansible-vault, no
  encrypted file in git.
- `secrets.yml.tpl` is TF-generated and gitignored; don't edit it by hand.
  Add new secrets via `tf/shared/modules/ceph-cluster/main.tf` (the
  `local.secrets` map), then `tofu apply` to re-render.

### Handler pattern

Define handlers in `roles/<role>/handlers/main.yml`:

```yaml
---
- name: Restart sshd
  ansible.builtin.systemd:
    name: ssh
    state: restarted
```

Trigger with `notify`:

```yaml
- name: Update SSH config
  ansible.builtin.copy:
    src: sshd_config
    dest: /etc/ssh/sshd_config
  notify: Restart sshd
```

### Variable naming

- All cluster-level variables use the `ceph_` prefix
- Role-specific internal variables use `<role_name>_` prefix (e.g.,
  `baseline_ops_user`, `baseline_podman_packages`)
- snake_case for everything
- Document every variable in `defaults/main.yml` with a comment explaining
  what it does and what valid values look like

### Role names

- snake_case: `ceph_deploy`, `os_tuning`, `hardware_tuning`
- Not: `ceph-deploy`, `CephDeploy`, `cephDeploy`

### Tags

Use tags on `import_tasks` in the role's `main.yml` to allow selective runs:

```yaml
- name: Phase 1 - Prerequisites
  ansible.builtin.import_tasks: prerequisites.yml
  tags: [prerequisites]

- name: Phase 2 - Bootstrap cluster
  ansible.builtin.import_tasks: bootstrap.yml
  tags: [bootstrap]
```

Run a specific phase:

```bash
scripts/ansible-play.sh deploy-ceph.yml --tags bootstrap
```

## mise tasks reference

| Task | Command | Description |
|------|---------|-------------|
| `setup` | `mise run setup` | Bootstrap dev environment (venv, pip, galaxy) |
| `lint` | `mise run lint` | yamllint + ansible-lint + shellcheck (no 1P required) |
| `check` | `mise run check` | Syntax-check all playbooks (no 1P required) |
| `test` | `mise run test` | Molecule verify for roles with test scenarios |
| `preflight` | `mise run preflight` | TF artifacts + 1P session + SSH + connectivity |
| `status` | `mise run status` | Read-only cluster health check (via ansible-play.sh) |
| `drift` | `mise run drift` | Detect configuration drift (via ansible-play.sh) |
| `deploy` | `mise run deploy` | Full deploy pipeline (via ansible-play.sh) |
| `backup` | `mise run backup` | Export cluster config for DR (via ansible-play.sh) |
| `capture` | `mise run capture` | Snapshot RGW TLS + admin keyring to 1P (DR belt) |
| `bench-rados` | `mise run bench-rados` | RADOS bench (raw cluster I/O) |
| `destroy` | `mise run destroy` | Destroy cluster (interactive confirmation) |

Inventory rendering and secret-item management are TF responsibilities
— `tofu apply` in `tf/deployment/staging/austin/ceph/` renders `inventory.ini` and
`secrets.yml.tpl` for every cluster declared in `clusters.auto.tfvars`.
Cluster secrets live in `yucca_tf_dev` (see [docs/secrets.md](docs/secrets.md)).

## File organization

```
yucca/
├── tf/                                 # Terraform state + secrets + rendering (authoritative)
│   ├── shared/modules/ceph-cluster/    # Module: per-cluster orchestration + rendering
│   └── deployment/staging/austin/ceph/     # Cluster declarations + tofu apply target
└── ansible/ceph/                       # This directory
    ├── *.yml                           # Top-level playbooks (site.yml, deploy-ceph.yml, etc.)
    ├── inventories/
    │   └── <partition>-<region>/<cluster>/
    │       ├── inventory.ini           # TF-rendered (gitignored)
    │       ├── secrets.yml.tpl         # TF-rendered, consumed by op inject (gitignored)
    │       ├── group_vars/all/
    │       │   └── vars.yml            # Cluster-wide variables (plaintext, committed)
    │       └── host_vars/
    │           ├── <hostname>.yml      # Per-node hardware config (committed)
    │           └── <hostname>.local.yml # Per-operator overrides (gitignored)
    ├── roles/
    │   └── <role_name>/
    │       ├── defaults/main.yml       # Default variables (documented)
    │       ├── meta/main.yml           # Role metadata + dependencies
    │       ├── tasks/main.yml          # Entry point (imports sub-task files)
    │       ├── handlers/main.yml       # Service restart handlers
    │       ├── templates/*.j2          # Jinja2 templates
    │       └── molecule/default/       # Test scenario (optional)
    ├── scripts/
    │   ├── ansible-play.sh             # Wrapper: op inject + ansible-playbook
    │   ├── install-ssh-keys.sh         # Pull ansible-iac private keys from 1P → ~/.ssh/
    │   └── preflight.sh                # Pre-deploy checks
├── docs/                              # Operational documentation
│   ├── runbooks/                      # Step-by-step operational procedures
│   └── archive/                       # Historical deployment notes
├── .mise.toml                         # Task runner + Python version + CEPH_ENV
├── ansible.cfg                        # Ansible config (SSH, caching, output)
├── requirements.txt                   # Python dependencies
└── requirements.yml                   # Ansible Galaxy collections
```

### What goes where

- **`roles/`** -- Reusable automation. Each role handles one concern (baseline
  setup, Ceph deploy, OS tuning, security). Roles never reference a specific
  cluster -- they use variables from inventory.
- **`inventories/`** -- Cluster-specific data. IPs, hardware mappings, network
  config, secrets. Each cluster is fully self-contained in its directory.
- **`scripts/`** -- Controller-side tooling. Things that run on your workstation,
  not on target nodes. Secret management, name generation, validation.
- **Top-level `*.yml`** -- Playbooks that wire roles to hosts. Each playbook is
  a thin wrapper: set `hosts`, `become`, and import a role.

## Commit messages

Use [conventional commits](https://www.conventionalcommits.org/) for future CI
compatibility:

```
feat(ceph_deploy): add RGW virtual-hosted bucket support
fix(os_tuning): correct TCP buffer sizes for 10GbE
chore(deps): bump ansible-core to 2.20.4
docs(runbooks): add disk replacement procedure
refactor(baseline): split packages into podman and diagnostics
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

Scope: role name, `scripts`, `inventory`, `deps`, or omit for repo-wide changes.

## Playbook execution order

The full deploy pipeline (`mise run deploy` or `site.yml`) runs in this order:

```
1. baseline.yml        -- ops user, packages, /etc/hosts, services
2. tune-os.yml         -- sysctl, TCP buffers, ulimits
3. tune-hardware.yml   -- I/O scheduler, readahead, queue depth
4. deploy-ceph.yml     -- cephadm bootstrap, join, placement, OSDs, RGW
5. tune-ceph.yml       -- recovery throttles, scrub window, telemetry
6. harden.yml          -- nftables firewall, SSH hardening
```

Provisioning (`provision.yml`) is a separate concern that runs before this
pipeline on bare-metal live images.

## Editor config

The `.editorconfig` enforces:
- YAML/Jinja2: 2-space indent
- Python: 4-space indent
- Shell: 2-space indent
- All files: UTF-8, LF line endings, trailing whitespace trimmed
