# ADR-004: Multi-Inventory over Multi-Repo

## Status

Accepted. The core decision (one repo, per-cluster inventory dirs) stands.
Refined by ADR-009 — inventory files are now TF-rendered rather than
hand-authored, and the `vault-password.sh`/`secrets-init.sh` mechanism
referenced below has been replaced by `op inject` + `scripts/ansible-play.sh`.

## Context

We operate multiple Ceph clusters across different sites and purposes:

- `sietch-ceph.dev.austin.int` -- 3-node dev cluster in Austin datacenter
- `painbox-ceph.dev.hel.htz` -- single-node dev cluster at Hetzner Helsinki

Each cluster has different hardware, networking, SSH access, and credentials.
The common approaches are: (a) one repository per cluster, or (b) one
repository with per-cluster inventory directories.

Separate repos cause role drift -- a fix to `ceph_deploy` in one repo must be
cherry-picked to every other repo. Shared roles via Git submodules or Galaxy
add dependency management overhead. The clusters share the same roles, playbooks,
and scripts; only the inventory data (host lists, IPs, credentials, host_vars)
differs.

## Decision

One repository with a top-level `inventories/` directory containing one
subdirectory per cluster. Each cluster directory has its own `inventory.ini`,
`group_vars/`, and `host_vars/`. The `ansible.cfg` has no default inventory --
the active cluster is selected via `-i inventories/<cluster>/inventory.ini` or
the `CEPH_ENV` environment variable.

Scripts like `vault-password.sh` and `secrets-init.sh` derive the cluster
identity from `CEPH_ENV` (parsing the inventory path to extract the cluster
ID), so they work against any cluster without hardcoded names.

## Consequences

- **Positive:** Role and playbook changes apply to all clusters immediately.
  No cherry-picking or submodule syncing.
- **Positive:** Cluster-specific config (IPs, OSD maps, SSH keys, vault
  passwords) is cleanly isolated in per-cluster inventory directories.
- **Positive:** Scripts auto-detect cluster context from `CEPH_ENV`, so the
  same tooling works for Austin and Hetzner without modification.
- **Negative:** A broken role change affects all clusters. Mitigated by testing
  on painbox (Hetzner) before applying to sietch (Austin production path).
- **Negative:** Repository grows with each cluster. Acceptable at our scale
  (inventory data is small).
