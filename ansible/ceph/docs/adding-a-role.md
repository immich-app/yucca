# Adding a role

How to create a new Ansible role in this project. The heavy lifting is in
the existing roles — this doc is the skeleton + wiring + pre-submit
checklist; copy an exemplar for idioms.

For code-level patterns (idempotency, `changed_when`, handlers, secrets
handling, shell conventions), see [patterns.md](patterns.md). For how roles
compose into the overall pipeline, see
[architecture.md §6](architecture.md).

## Skeleton

```
roles/<role_name>/
├── defaults/main.yml     required — every variable with a default + comment
├── meta/main.yml         required — author, license, Ansible version
├── tasks/main.yml        required — imports sub-task files, tagged
├── handlers/main.yml     if the role restarts/reloads services
├── templates/*.j2        Jinja2 templates
└── molecule/default/     optional — test scenario
```

Role names use `snake_case` (`ceph_deploy`, `os_tuning`).

**Cluster-level variables** use the `ceph_` prefix (overridable in
`group_vars/all/vars.yml`). **Role-internal variables** use the
`<role_name>_` prefix. The `.ansible-lint` config skips
`var-naming[no-role-prefix]` because all roles share the `ceph_` prefix
for cluster-level settings — this is intentional.

## Exemplars to copy from

| Copy this when you're writing... | Role |
|---|---|
| A phased deployment with tags | `ceph_deploy` |
| Modular sub-task files with header comments | `baseline` |
| Kernel/sysctl values with units documented | `os_tuning` |
| Per-device-class settings + feature toggles | `hardware_tuning` |
| Templated firewall config with opt-in features | `security` |
| Ceph CLI shell tasks with `changed_when` patterns | `ceph_tuning` |

Every existing role has a header comment block at the top of
`defaults/main.yml` explaining its scope — open one and mirror the shape.

## Wiring into the pipeline

### 1. Playbook wrapper

Create a top-level playbook (e.g. `my-feature.yml`) that imports the role:

```yaml
---
# Brief description + usage tags.
- name: My feature
  hosts: ceph_nodes
  become: true
  roles:
    - my_role_name
```

### 2. `site.yml` (if part of full deploy)

Insert in the correct dependency position in `site.yml`:

```yaml
- import_playbook: my-feature.yml
```

Order matters — see [architecture.md §6 "Why this order matters"](architecture.md).

### 3. `mise run deploy` (if part of full deploy)

Add to the `deploy` task in yucca-root `.mise/config.toml` (or
`ansible/ceph/.mise.toml` if the task lives there). Always invoke via
the wrapper so secrets resolve:

```toml
echo "=== My feature ===" && scripts/ansible-play.sh my-feature.yml
```

### 4. Optional: standalone mise task

For playbooks useful to run independently (like `bench`, `drift`,
`status`):

```toml
[tasks.my-feature]
description = "One-line description"
run = "scripts/ansible-play.sh my-feature.yml"
```

See [scripts.md](scripts.md) for the wrapper reference.

## Molecule test (optional)

Not every role needs one — the `ceph_deploy` role is the only one with
a full scenario today. If you're writing something non-trivial, copy
`roles/ceph_deploy/molecule/default/` as a starting point.

## Pre-submit checklist

Before opening a PR, verify:

- [ ] `mise run lint` passes clean (yamllint + ansible-lint + shellcheck)
- [ ] `mise run check` passes syntax-check with the role's playbook
- [ ] Every variable in `defaults/main.yml` has a comment explaining what it does
- [ ] All modules use FQCN (`ansible.builtin.apt`, not `apt`)
- [ ] All `shell`/`command` tasks have `changed_when`
- [ ] All `shell` tasks set `args.executable: /bin/bash` and include `set -o pipefail`
- [ ] Secret-handling tasks have `no_log: true`
- [ ] `meta/main.yml` has author, license, description, `min_ansible_version: "2.19"`
- [ ] Tags on `import_tasks` in `main.yml`
- [ ] Playbook wrapper exists at `ansible/ceph/` root
- [ ] Role is added to `site.yml` in the correct position (if part of full deploy)
- [ ] Anti-patterns in [patterns.md §Anti-patterns](patterns.md) not violated
