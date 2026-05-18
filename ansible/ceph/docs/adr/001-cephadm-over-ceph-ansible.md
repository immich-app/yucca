# ADR-001: cephadm + Ansible Wrapper Roles over ceph-ansible

## Status

Accepted

## Context

The official `ceph-ansible` project targets Ceph Quincy and older releases. Ceph
Tentacle (the release this cluster runs) is a cephadm-native release where
`ceph-ansible` is deprecated and no longer tested. Additionally, `ceph-ansible`
is a large, opinionated framework that owns the entire node lifecycle -- from
package installation to OSD creation -- making it difficult to compose with our
own provisioning pipeline (debootstrap, baseline role, security hardening).

We needed a deployment approach that:

- Works with Ceph Tentacle (cephadm-native release).
- Gives us explicit control over each phase (bootstrap, join, OSD creation,
  RGW, monitoring) so we can debug and re-run individual stages.
- Stays composable with our existing Ansible roles for OS provisioning,
  baseline configuration, and security.

## Decision

We use **cephadm directly**, wrapped in thin Ansible task files inside the
`ceph_deploy` role. Each deployment phase is a separate task file
(`bootstrap.yml`, `join.yml`, `osds.yml`, `rgw.yml`, etc.) that calls
`cephadm` and `ceph` CLI commands with idempotency guards.

The Ansible layer handles orchestration (ordering, host targeting, variable
interpolation, idempotency checks) while cephadm handles container management,
daemon lifecycle, and config distribution. Comments in `bootstrap.yml` note
that cephadm automatically distributes `ceph.conf`, admin keyrings, and SSH
keys during `ceph orch host add` -- we lean on that rather than reimplementing
distribution logic.

## Consequences

- **Positive:** Full compatibility with Ceph Tentacle and future releases. Each
  phase is independently re-runnable. Task files are small and auditable. No
  dependency on an external Ansible Galaxy role with its own release cycle.
- **Positive:** Operators can `--tags osds` to re-run just OSD creation after a
  failure, or `--tags rgw` to redeploy the gateway layer independently.
- **Negative:** We own the idempotency logic (e.g., `pvs | grep ceph` checks,
  `stat` on `/etc/ceph/ceph.conf`). Upstream ceph-ansible handled this
  automatically, but it also hid failures behind abstraction layers.
- **Negative:** New Ceph features require manual task-file additions rather than
  a Galaxy role version bump.
