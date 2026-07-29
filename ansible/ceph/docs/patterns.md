# Patterns

Project-specific Ansible idioms. This doc skips generic Ansible hygiene
(FQCN, `set -o pipefail`, etc. -- those are table stakes) and focuses on
patterns that are non-obvious or specific to how this Ceph automation is
built.

For how patterns wire into the wrapper + secrets flow, see
[scripts.md](scripts.md). For role structure and the pre-submit checklist,
see [adding-a-role.md](adding-a-role.md).

---

## Check-then-set against the cluster

**Problem:** `ceph config set` always reports `changed`. Running it
unconditionally makes every play dirty and obscures real drift.

**Pattern:** read the current value, compare to the expected value, apply
only if different. The comparison is the key -- raw `ceph config set` with
`changed_when: true` is a lie.

Canonical example -- `roles/ceph_tuning/tasks/main.yml`, which diffs the whole
declared model against `ceph config dump` and loops only over what came back
different:

```yaml
- name: Diff declared Ceph config against the mon database
  ansible.builtin.script: ceph_config_diff.py
  environment:
    CEPH_CONFIG_MODEL: "{{ {'desired': ceph_config_effective, ...} | to_json }}"
  register: ceph_config_plan
  changed_when: false

- name: Apply Ceph config values
  ansible.builtin.command:
    argv: ["ceph", "config", "set", "{{ item.who }}", "{{ item.key }}", "{{ item.value }}"]
  loop: "{{ ceph_config_changes.set | default([]) }}"
  changed_when: true
```

Other instances: `rgw.yml` (zonegroup hostnames), `crush-rules.yml`
(rule existence), `monitoring.yml` (module enable check).

### Comparing Ceph config values

A dump reports every value as a string, and not in the form the model wrote it:
`604800.000000` for an int option, `0.100000` for `0.1`, `true` for a bool. So a
plain string comparison produces false drift.

Casting both sides with `| float` fixes the numeric cases and breaks the rest:
Ansible's `float` filter returns `0.0` for anything non-numeric, so
`osd_mclock_profile: balanced` and `osd_mclock_profile: high_recovery_ops` both
cast to `0.0` and compare equal. Once a model can hold strings and bools as well
as numbers, the comparison has to be typed -- exact match first, numeric match
second, unequal otherwise. `ceph_config_diff.py` does this; do not reintroduce a
Jinja `| float` comparison over arbitrary config values.

---

## Marker-driven idempotency

**Problem:** provisioning is destructive and multi-phase. A crash during
phase 6 must not re-wipe disks on the next run. But the role still needs
to handle a completely fresh node.

**Pattern:** write a JSON marker at the end of provisioning. On
subsequent runs, check for the marker and skip completed phases.

The marker filename (`/etc/ceph-provisioned.json`) is project-scoped --
every Ceph cluster writes the same filename. The marker's *contents*
identify which cluster + host the machine belongs to (hostname, fqdn,
bond_ip, cluster_name, SSD serials, provisioned_at timestamp).

**Template:** `roles/provision_host/templates/ceph-provisioned.json.j2`.

**Resume gate** -- `roles/provision_host/tasks/main.yml`:

```yaml
- name: Check if provisioning marker is present in chroot
  ansible.builtin.stat:
    path: "{{ provision_mnt }}{{ provision_marker_path }}"
  register: marker_stat

- name: Set provisioning_done fact
  ansible.builtin.set_fact:
    provisioning_done: "{{ marker_stat.stat.exists | bool }}"
```

Then every chroot phase is gated on `when: not provisioning_done`.

`disks.yml` additionally handles the "md array already assembled but
nothing mounted" case -- mounts, reads the marker, validates the hostname
matches `inventory_hostname`, and either resumes (marker matches) or
unmounts and re-wipes (marker missing or wrong host).

**Use when:** any multi-step destructive workflow where partial
completion must be resumable. The marker must contain enough identity
information to distinguish "this node's previous run" from "a different
node's leftover state."

---

## Block/rescue cleanup

**Problem:** if provisioning fails mid-chroot (e.g., debootstrap network
error), bind mounts at `/mnt/dev`, `/mnt/proc`, `/mnt/sys` remain active.
The next run fails because it can't cleanly remount.

**Pattern:** wrap the phase sequence in `block/rescue`. The rescue
includes a shared `unmount.yml` that tears down mounts in reverse order,
then re-raises the failure.

```yaml
- name: Provisioning phases
  block:
    - ansible.builtin.import_tasks: prerequisites_live.yml
    - ansible.builtin.import_tasks: disks.yml
    # ... phases 4-8 ...
    - ansible.builtin.import_tasks: finalize.yml
  rescue:
    - name: Unmount /mnt hierarchy on failure (best-effort cleanup)
      ansible.builtin.include_tasks: unmount.yml
    - name: Re-raise failure
      ansible.builtin.fail:
        msg: "Provisioning phase failed for {{ inventory_hostname }}."
```

The unmount tasks use `failed_when: false` -- if a path isn't mounted, we
just want to keep going.

---

## Conditional features

**Problem:** not every cluster needs iSCSI, NFS, CPU governor tuning, or
centralized logging. These features should be zero-overhead when
disabled.

**Pattern:** gate on `<feature>_enabled | bool` with defaults of `false`.

Current feature flags:

| Feature | Toggle | Default | Consumer |
|---|---|---|---|
| CPU governor | `ceph_cpu_governor_enabled` | false | `hardware_tuning` |
| Centralized logging | `ceph_logging_enabled` | false | `os_tuning` |
| iSCSI firewall | `ceph_firewall_iscsi_enabled` | false | `security` |
| NFS firewall | `ceph_firewall_nfs_enabled` | false | `security` |
| Firewall overall | `ceph_firewall_enabled` | true | `security` |
| RGW TLS | `ceph_rgw_ssl` | false | `ceph_deploy/rgw` |
| Audit logging | `ceph_audit_enabled` | true | `ceph_tuning` |
| SSH open to all sources (dev) | `ceph_firewall_ssh_any_source` | true (dev) | `security` |
| Weekly fstrim timer (SSDs) | `ceph_enable_fstrim_timer` | true | `hardware_tuning` |
| LVM device filter | `ceph_lvm_filter_enabled` | false | `hardware_tuning` |

The `| bool` filter is mandatory. Ansible may pass booleans as strings
from inventory or extra-vars; without `| bool`, the string `"false"` is
truthy.

**In Jinja templates** (e.g. `nftables.conf.j2`):

```jinja2
{% if ceph_firewall_iscsi_enabled | bool %}
        ip saddr {{ net }} tcp dport {{ ceph_firewall_iscsi_port }} accept
{% endif %}
```

---

## Drift detection pattern

`drift.yml` is a read-only play that compares expected state against
live cluster. Three steps:

1. **Load all role defaults** via `vars_files` -- gives drift detection
   access to expected values without depending on any role's execution:

   ```yaml
   vars_files:
     - roles/baseline/defaults/main.yml
     - roles/os_tuning/defaults/main.yml
     # ...
   ```

2. **Accumulate results** into a list via `set_fact`:

   ```yaml
   drift_results: >-
     {{ drift_results + [{
       'category': 'sysctl',
       'item': item.item.key,
       'expected': item.item.expected | string,
       'actual': item.stdout | trim,
       'match': (item.stdout | trim) == (item.item.expected | string)
     }] }}
   ```

3. **Generate a formatted report** using Jinja in `set_fact`.

Categories checked: sysctl values, HDD/SSD I/O schedulers, nftables
policy, SSH `PasswordAuthentication`, ops sudo config, OSD status, MON
quorum, RGW daemon count, cluster health, Ceph config values.

**Use when:** building read-only comparison plays. The pattern generalizes
to any "expected vs actual" audit.

---

## CEPH_ENV as inventory selector

Wrappers and downstream scripts derive the cluster's paths from the
`CEPH_ENV` environment variable, which points at the TF-rendered
inventory file. Cluster identity is authoritative in
`clusters.auto.tfvars`; `CEPH_ENV` is the runtime pointer.

```
CEPH_ENV = inventories/staging-austin/sietch/inventory.ini
           |
           dirname ->  inventories/staging-austin/sietch
                       |
                       + "/secrets.yml.tpl"  -> op inject input
```

**`scripts/ansible-play.sh`** derives the secrets template path as
`$(dirname $CEPH_ENV)/secrets.yml.tpl` and fails closed if either file
is missing. See [scripts.md](scripts.md) for the full contract.

**Destroy task** in `.mise.toml` extracts the domain for the safety gate:

```bash
CEPH_ENV_DIR=$(dirname "$CEPH_ENV")                  # inventories/staging-austin/sietch
REGION_SLUG=$(basename "$(dirname "$CEPH_ENV_DIR")") # staging-austin (<partition>-<region>)
DOMAIN="${REGION_SLUG/-/.}.int.futo.cloud"           # staging.austin.int.futo.cloud
```

---

## Placement group logic

MON placement strategy varies by cluster size. A 2-node cluster should
NOT run 2 MONs (no quorum majority possible). A 3+ node cluster should
run MON on all nodes.

`roles/ceph_deploy/tasks/placement.yml`:

```yaml
- name: Calculate MON placement
  ansible.builtin.set_fact:
    mon_hosts: >-
      {%- if groups['ceph_mon'] | default([]) | length > 0 -%}
      {{ groups['ceph_mon'] | map('extract', hostvars, 'hostname_short') | join(',') -}}
      {%- elif active_hosts.stdout.split(',') | length <= 2 -%}
      {{ hostvars[groups['ceph_bootstrap'][0]]['hostname_short'] -}}
      {%- else -%}
      {{ active_hosts.stdout -}}
      {%- endif -%}
```

Three branches: (1) explicit `ceph_mon` inventory group -> use those;
(2) <= 2 active hosts -> single MON (bootstrap only, avoids 2-MON
quorum fragility); (3) 3+ active hosts -> MON on all active hosts.

MGR always deploys on all active hosts -- standby MGRs are harmless and
provide fast failover.

---

## Shell + `changed_when` discipline

Two rules worth stating explicitly because they're the most common
lint-clean failures:

1. **`changed_when: false`** for read-only commands (checks, queries,
   status).
2. **`changed_when: true`** only when guarded by `when:` -- the task only
   runs when something needs to change. Unguarded `changed_when: true`
   reports "changed" on every run; ansible-lint catches this.
3. **Output-based `changed_when`** for shell tasks that may or may not
   change state:

   ```yaml
   changed_when: "'CHANGED' in zonegroup_hostnames.stdout"
   ```

4. **`failed_when` with fallthrough** for commands where a specific
   error is expected and acceptable:

   ```yaml
   failed_when:
     - pg_data_result.rc != 0
     - "'is not >= current' not in pg_data_result.stderr | default('')"
   ```

Every `shell`/`command` task in this codebase sets one of these -- no bare
`command:` without a `changed_when`. Lint enforces it.

`no_log: true` on every task handling passwords, keys, or credentials.
Ansible output is committed to `ansible.log` and displayed to operators
-- secrets must never land there.

---

## Cephadm service specs over imperative loops

**Problem:** the role's first instinct is "iterate every disk / daemon /
service in Ansible and run `cephadm` per item." This couples the role
tightly to per-host hardware shape (path composition, partition layout,
LV vs disk topology) and breaks on any new cluster shape -- the original
`osds.yml` hardcoded `sas_path_prefix`, so it broke on the NVMe-RAID node's
different disk layout.

**Pattern:** for any cephadm-managed surface (OSDs, RGW, MON/MGR
placement, monitoring), render a **declarative service spec** and apply
it via `ceph orch apply -i <spec>.yaml`. Cephadm handles per-disk
discovery, daemon lifecycle, encryption, LVM, etc. internally. The role
becomes a thin renderer + applier; hardware shape moves into the
template's Jinja conditional, not the role logic.

**Examples in this codebase:**

- `templates/rgw-spec.yaml.j2` + `tasks/rgw.yml`'s `ceph orch apply -i`
  task -- RGW daemon placement spec.
- `templates/osd-spec.yml.j2` + `tasks/osds.yml`'s
  `ceph orch apply osd -i` task -- OSD service spec; one document per host
  *type* in a multi-doc YAML; Jinja conditional handles sietch-shape vs
  NVMe-RAID-shape path composition.

**Template skeleton:**

```jinja2
{% for host in groups['ceph_nodes'] %}
{% set h = hostvars[host] %}
---
service_type: <kind>
service_id: {{ h.hostname_short }}-<role>
placement:
  hosts: [{{ h.hostname_short }}]
spec:
  <kind-specific fields>
{% endfor %}
```

One document per host is the simple form, and it is what `rgw-spec.yaml.j2`
does. Watch it at scale: cephadm reconciles every managed spec on every
serve-loop pass, so N specs across N hosts makes the loop cost scale with the
fleet. If the hosts are uniform, bucket them by their rendered field values and
emit one document per bucket with a multi-host `placement.hosts` --
`osd-spec.yml.j2` does this behind `ceph_osd_spec_group_by_layout`.

Decide the bucketing when the cluster is built, not after. A daemon's owning
service is fixed at creation (for OSDs, in the LVM tag
`ceph.osdspec_affinity`), and `ceph orch ls` fabricates a service for any
daemon whose spec has gone missing, so re-bucketing a live cluster adds specs
without moving daemons onto them. Where a cluster is already deployed, the
mitigation for loop cost is `unmanaged`, not re-bucketing.

**Apply pattern in tasks/*.yml:**

```yaml
- name: Render cephadm service spec
  ansible.builtin.template:
    src: <kind>-spec.yml.j2
    dest: /etc/ceph/<kind>-spec.yml
    mode: '0644'
  delegate_to: "{{ groups['ceph_bootstrap'][0] }}"
  run_once: true

- name: Apply cephadm service spec
  ansible.builtin.command: ceph orch apply <kind> -i /etc/ceph/<kind>-spec.yml
  delegate_to: "{{ groups['ceph_bootstrap'][0] }}"
  run_once: true
  changed_when: ...
```

**Use when:** the surface you're managing is a cephadm-orch-supported
service type (`host`, `mon`, `mgr`, `osd`, `rgw`, `mds`, `nfs`,
`prometheus`, `grafana`, `alertmanager`, `node-exporter`,
`ceph-exporter`, etc.). Don't use for surfaces cephadm doesn't manage
declaratively (CRUSH rules, pools, ceph config tunables, RGW realm/zone
setup, S3 user creation) -- those still need imperative `ceph` /
`radosgw-admin` calls.

**Trade-off vs imperative loops:** debugging "why isn't this disk
becoming an OSD?" is harder -- there's no per-disk log line. Check
`ceph orch ls` / `ceph orch ps` / `ceph cephadm osd activate <host>
--dry-run` instead. Worth the trade-off because the role becomes
hardware-shape-agnostic.

The spec lists device paths explicitly rather than using cephadm's
`rotational` filter, so empty bays stay empty and OS / block.db partitions are
never claimed by auto-discovery.

---

## Anti-patterns

### `changed_when: true` without a `when` guard

```yaml
# BAD -- reports changed on every run even when idempotent
- ansible.builtin.command: ceph config set osd foo bar
  changed_when: true

# GOOD -- only runs when needed, so changed_when: true is accurate
- ansible.builtin.command: ceph config set osd foo bar
  when: current_foo != 'bar'
  changed_when: true
```

### Shell without pipefail

```yaml
# BAD -- if `ceph osd dump` fails, grep runs on empty input and task succeeds
- ansible.builtin.shell: ceph osd dump | grep noin

# GOOD -- pipefail propagates the ceph failure
- ansible.builtin.shell: |
    set -o pipefail
    ceph osd dump | grep noin
  args:
    executable: /bin/bash
```

### Hardcoded site-specific values in roles

```yaml
# BAD -- in a role's tasks/main.yml
- ansible.builtin.command: ceph config set osd osd_recovery_max_active 1

# GOOD -- the value is data, layered by cluster
ceph_config_cluster:
  osd:
    osd_recovery_max_active: 3
```

Roles use `defaults/main.yml` for all tunables. Site-specific values live
in `inventories/<partition>-<region>/<cluster>/group_vars/all/vars.yml`.

### Where a tunable belongs

Three layers, lowest to highest. Ansible's own precedence does the work; no
`hash_behaviour` change is needed or wanted.

| Layer | Lives in | Holds |
|---|---|---|
| Role default | `roles/<role>/defaults/main.yml` | safe on any cluster |
| Per-cluster | `<inventory>/group_vars/all/vars.yml` | cluster shape |
| Per-host | `<inventory>/host_vars/<host>.yml` | machine exceptions |

Which layer is available depends on **where the change is applied**, and the
two tuning surfaces differ:

**OS and hardware tuning** is applied on each node by a role that runs against
every host, so all three layers work directly. `host_vars` is the right place
for a per-machine exception.

**Ceph tuning is different.** Those tasks run only on the bootstrap node,
because the mon config database is cluster-wide state -- another host's
`host_vars` is not in scope there. Per-host Ceph settings go in the
`ceph_config` model instead, keyed by Ceph's own mask syntax:

```yaml
ceph_config_cluster:
  osd:                              # every OSD
    osd_max_backfills: 8
  osd/class:hdd:                    # only HDD-backed OSDs
    osd_recovery_max_active: 3
ceph_config_host:
  osd/host:spice-ceph-alyssa:       # one node
    osd_scrub_load_threshold: 5
```

Ceph resolves those most-specific-first on its own (`global` -> `osd` ->
`osd/class:hdd` -> `osd/host:x` -> `osd.N`), which is why this does not need
Ansible machinery. cephadm already uses the same mechanism for its per-host
`osd_memory_target` autotune. Reserve `host_vars` for facts about the machine:
`host_index`, `bond_ip`, the disk map.

Merging uses `combine(recursive=True)`, so a cluster overriding one option keeps
the rest of the section. A plain `host_vars` override of a dict or list replaces
it wholesale -- which is why `spice-ceph-miguel` has to repeat all fourteen
entries of `ceph_hdd_osds` to change one.

### Reading Ceph config back: `dump`, not `get`

```bash
# BAD -- resolves the section hierarchy
ceph config get osd osd_max_backfills      # returns global's value as if it were osd's
ceph config get osd/class:hdd osd_max_backfills   # EINVAL, masks not accepted

# GOOD -- exact (section, mask, name) rows
ceph config dump -f json
```

`ceph config get` answers "what would a daemon in this section see", which is
not the same question as "what does this model own". A value living in `global`
reads back identically to one in `osd`, so an idempotency check built on it
concludes it has nothing to do and never writes. That is exactly how spice ended
up with its recovery throttles in `global`, untouched by the role that claimed
to own them, for the cluster's whole life. It also rejects masks outright, which
would make every per-class and per-host setting invisible.

`roles/ceph_tuning/files/ceph_config_diff.py` does this comparison for both the
converge and the drift check, so the two cannot disagree about what differs.
Comparison is typed there rather than in Jinja because a dump reports every
value as a string (`604800.000000` for an int, `true` for a bool) and the
`float` filter returns `0.0` for anything non-numeric -- which would read
`balanced` and `high_recovery_ops` as equal.

### Using `ansible_play_batch` / `ansible_play_hosts` for placement specs

```yaml
# BAD -- --limit shrinks play_batch, cephadm removes daemons from omitted hosts
- ansible.builtin.command:
    ceph orch apply rgw --placement="{{ ansible_play_batch | join(',') }}"
```

cephadm is declarative: applying a smaller placement list REMOVES daemons
from hosts not in the list. Always use `groups['ceph_nodes']` (the full
inventory group) for placement specs, never `ansible_play_batch` or
`ansible_play_hosts`. The comment at
`roles/ceph_deploy/tasks/rgw.yml:466` explains the failure mode in detail.

### Running plays with bare `ansible-playbook`

Every playbook in this project consumes op-injected secrets. Running
`ansible-playbook foo.yml` directly skips the wrapper, `op inject` never
runs, and `vault_*` variables are empty -- tasks that need them fail with
confusing errors. Always `scripts/ansible-play.sh <playbook.yml>`. See
[scripts.md](scripts.md) for the full contract.
