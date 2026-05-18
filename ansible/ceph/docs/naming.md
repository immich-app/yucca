# Naming

Every name derivable in this project — hostname, inventory directory, 1P
item title, SSH key filename — traces back to one entry per cluster in
`tf/deployment/<env>/ceph/clusters.auto.tfvars`. TF's `ceph-cluster` module
assembles the rest.

For how naming fits the broader system see
[architecture.md §4 (Terraform)](architecture.md); for the per-item 1P
catalog see [secrets.md](secrets.md); for the SSH-key lifecycle see
[ADR-010](adr/010-ssh-keys-in-1password.md).

## The three name layers

Three parallel naming surfaces derive from the same tfvars entry, but
**only the hostname carries the `role_in_hostname` segment**. Inventory
directory and 1P item prefix are both hardcoded to `ceph` / `CEPH` in the
ceph-cluster module — they're project-scoped, not role-scoped.

| Surface                | Pattern                                           | Role source                     |
|------------------------|---------------------------------------------------|---------------------------------|
| Hostname (short + FQDN)| `<cluster>-<role>-<name>[.<env>.<dc>.<provider>.futo.cloud]` | `role_in_hostname` tfvar |
| Inventory directory    | `inventories/<cluster>-ceph.<env>.<dc>.<provider>/` | always `ceph` (module-hardcoded) |
| 1P item prefix         | `<CLUSTER>_CEPH_*`                                  | always `CEPH` (module-hardcoded) |

This split is deliberate. A future cluster where every node is a dedicated
OSD might set `role_in_hostname = "osd"` (yielding hostnames like
`mesa-osd-willow`) but its inventory dir and 1P items would still grep-match
`*-ceph.*` and `*_CEPH_*` alongside every other Ceph-project cluster.

### Hostname segments

| Component | Example                         | Source (per-cluster tfvars field)    |
|-----------|---------------------------------|--------------------------------------|
| cluster   | `sietch`, `painbox`             | top-level map key                    |
| role      | `ceph` (small clusters), `osd`  | `role_in_hostname` (default `ceph`)  |
| name      | `laurel`, `evelyn`              | `hosts[].name`, or TF-picked         |
| env       | `dev`, `staging`, `prod`        | `environment`                        |
| dc        | `austin`, `hel`, `fsn`          | `datacenter`                         |
| provider  | `int`, `htz`                    | `provider_code`                      |

Current `role_in_hostname` values: both sietch and painbox use `ceph`
(mixed-role, all-nodes-are-everything). Dedicated-role hostnames (`osd`,
`mon`) are supported but not used today.

## Cluster naming

**Who chooses:** the engineer adding the cluster picks the name at the
moment they add the entry to `clusters.auto.tfvars`. No automation — it's
a deliberate, one-time decision.

**When:** before any `mise run tf:apply`, any 1P item creation, any cluster
bootstrap. Renaming after deployment is expensive (see "Cost of renaming"
below).

**Convention (unenforced):** Dune-themed. Existing clusters are `sietch`
(an underground Fremen community) and `painbox` (the Bene Gesserit
gom-jabbar test apparatus). Dune candidates not yet used, and that fit
the hard constraints below: `arrakis`, `caladan`, `giedi`, `ixian`,
`kwisatz`, `muaddib`, `fremen`, `chani`, `leto`, `jessica`. Nothing in
the code enforces Dune specifically — mixed themes or theme breaks are
acceptable when they communicate intent better (e.g., a cluster named
after its datacenter for a production tier).

**Hard constraints:**

- **lowercase alphanumeric** — becomes the HCL map key, the inventory
  directory segment (`<name>-ceph.<env>...`), the hostname prefix, and
  (uppercased) the 1P item prefix (`<NAME>_CEPH_*`).
- **Short** — appears in every hostname and every 1P item title. Aim for
  6–10 characters; 15 is the realistic ceiling.
- **Unique within the `yucca_tf_*` 1P item namespace** — other Futo
  consumers (o11y, future stacks) write items to the same vault set.
  Before committing, check:
  ```bash
  op item list --vault yucca_tf_dev --format=json \
    | jq -r '.[] | .title' | grep -i "^<PROPOSED_NAME>_"
  ```
  Must return empty.
- **Not already a `clusters.auto.tfvars` key** — TF enforces this with
  a plan-time error.
- **No dashes, dots, or underscores in the cluster name itself** — those
  are segment separators in inventory directories and hostnames. A cluster
  name `my-cluster` would produce `my-cluster-ceph-laurel` which parses
  ambiguously. Use `mycluster` instead.

**Soft guidance:**

- Memorable — operators will say it out loud in incidents.
- Distinct from existing clusters' first 3 letters (grep-friendly in logs).
- Doesn't encode environment or datacenter — those live in separate
  segments. The cluster name is project identity, not location.

### Cost of renaming after deployment

A rename touches all of:

1. `clusters.auto.tfvars` map key
2. Inventory directory name
3. Every hostname (short + FQDN) and every SSH `known_hosts` entry for every operator
4. 1P item titles (`<OLD>_CEPH_*` → `<NEW>_CEPH_*`) including the SSH Key item
5. cephadm cluster identity (requires cluster rebuild in the common case)
6. `ansible_ssh_key` path in the tfvars (`~/.ssh/id_ed25519_<cluster>`) and
   the mapping in `scripts/install-ssh-keys.sh`
7. Any DNS records and external systems that reference the hostnames

Expect hours-to-days of work, cluster downtime, and coordination with
every consumer of the cluster's S3/dashboards/etc. Painbox's rename
(from `painbox-osd-5c3cac.lab.*` to `painbox-ceph-evelyn.dev.*`) was
cheap only because painbox is idle — a running production Ceph cluster
makes this a multi-week project.

**Pick once. Pick deliberately.**

## Host naming

Each host entry in `hosts = [...]` can either declare a name or omit it
to let TF pick one from the wordlist. Both paths are first-class;
different clusters use different paths based on operator preference.

### Operator-declared

Declare the name explicitly in the tfvars. Used when the operator has a
specific name in mind — typically because it's been spoken during
planning and the team already uses it.

```hcl
hosts = [
  { name = "laurel", bond_ip = "10.10.10.90", bootstrap = true },
  { name = "lawson", bond_ip = "10.10.10.91" },
  { name = "samara", bond_ip = "10.10.10.92" },
]
```

Sietch uses this path.

Names must be unique **within a cluster**, not globally. A future
`mesa-ceph-laurel` can coexist with `sietch-ceph-laurel` — the FQDN
disambiguates.

### Auto-picked from wordlist

Omit `name` (leave the field absent) and the module picks from
`tf/shared/modules/ceph-cluster/wordlist.txt` (923 words) via
`random_shuffle`, seeded by `cluster_name` + `name_seed`. Picks are
stable across subsequent applies.

```hcl
hosts = [
  { bond_ip = "157.180.105.198", bootstrap = true },  # TF picks
]
```

Painbox uses this path — `hosts[0]` has no name, and TF picked `evelyn`
on first apply, yielding `painbox-ceph-evelyn`.

Operator-declared names are excluded from the available pool to prevent
collisions within the cluster.

### Stability rules (either path, or mixed)

- **Add new hosts at the tail of the list.** Auto-picked names are
  positional — `hosts[0]` gets `random_shuffle.result[0]`, `hosts[1]`
  gets `result[1]`, and so on. Inserting a new entry at position 0 would
  shift every subsequent host's result-index. Always append.
- **Never bump `name_seed` once a cluster has deployed hosts.** Bumping
  re-rolls every auto-picked name in the cluster, which cascades into
  certs, SSH `known_hosts`, 1P items, DNS, cephadm identity.
- **Mixing paths has a non-obvious side effect.** Auto-picked names are
  drawn from `available_words = wordlist − explicit_names`. Adding or
  removing an *operator-declared* host changes `explicit_names`, which
  changes the shuffle input length, which re-permutes the result. An
  auto-picked host at `hosts[2]` could get a different name even if
  nothing about its own entry changed. The safe patterns:
  1. All-operator-declared within a cluster (sietch's model), or
  2. All-auto-picked within a cluster (painbox's model).
  Mixed works for initial setup but complicates later add/remove.
- **Converting between paths after deploy** (e.g., adding `name = "evelyn"`
  to a host that previously auto-picked `evelyn`) **does not preserve the
  name** despite appearing to match — it rewrites `available_words` and
  re-rolls every other auto-pick. Only do this if you're prepared to pin
  every auto-named host in the same apply, or accept the cluster-wide
  rename.

## Inventory directory naming

TF renders inventory directories as:

```
inventories/<cluster>-ceph.<env>.<dc>.<provider>/
```

The `-ceph` segment is hardcoded in the ceph-cluster module regardless of
`role_in_hostname`. Keeps all Ceph-project inventory paths grep-matchable
as `*-ceph.*` — even a hypothetical cluster with `role_in_hostname = "osd"`
(hostnames `mesa-osd-*`) still renders `mesa-ceph.prod.fsn.htz/`.

Defined in `tf/deployment/<env>/ceph/main.tf` (`local.inventory_dirs`).

## 1Password item naming

Items are titled `<CLUSTER>_CEPH_<specifier>` (SHOUTY_SNAKE_CASE). The
`<CLUSTER>_CEPH_*` prefix is hardcoded in
`tf/shared/modules/ceph-cluster/main.tf` (`local.secret_prefix`) — same
project-scoping rationale as the inventory directory.

Per cluster, the expected item set:

| Category | Title                                                  | Source of values                                    |
|----------|--------------------------------------------------------|-----------------------------------------------------|
| Password | `<CLUSTER>_CEPH_OPS_PASSWORD`                          | `op item create --generate-password` at setup       |
| Password | `<CLUSTER>_CEPH_DASHBOARD_PASSWORD`                    | same                                                |
| Password | `<CLUSTER>_CEPH_GRAFANA_PASSWORD`                      | same                                                |
| Password | `<CLUSTER>_CEPH_S3_SVC_YUCCA_RESTIC_ACCESS_KEY`        | same                                                |
| Password | `<CLUSTER>_CEPH_S3_SVC_YUCCA_RESTIC_SECRET_KEY`        | same                                                |
| SSH Key  | `<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY`                   | `op item create --category "SSH Key" --ssh-generate-key=ed25519` |
| Document | `<CLUSTER>_CEPH_RGW_TLS_CERT`                          | populated by `mise run capture` post-deploy         |
| Document | `<CLUSTER>_CEPH_RGW_TLS_KEY`                           | same                                                |
| Document | `<CLUSTER>_CEPH_CLIENT_ADMIN_KEYRING`                  | same                                                |

Passwords + SSH Key are created at cluster-add time (step 6 of
[adding-a-cluster.md](adding-a-cluster.md)). DR Documents are upserted
automatically on the first `mise run capture` after deploy (step 10).

For the full consumption flow (which Ansible variable each item maps to,
which role reads it) see [secrets.md](secrets.md).

## Workstation SSH key filenames

The operator-side private key path is derived from the cluster name:

```
~/.ssh/id_ed25519_<cluster>
```

Examples: `~/.ssh/id_ed25519_sietch`, `~/.ssh/id_ed25519_painbox`. Per
[ADR-010](adr/010-ssh-keys-in-1password.md), the keypair lives in
`<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY` in 1P and is installed via
`scripts/install-ssh-keys.sh <cluster>`.

The `ansible_ssh_key` field in the cluster's tfvars entry must match this
path. If you choose a non-default filename (unusual), update both together
and also adjust the mapping in `scripts/install-ssh-keys.sh`.
