# ADR-003: Baseline Role Split from Provisioning

## Status

Accepted

## Context

The `provision_host` role runs inside a chroot on a live image. It must create
the minimum viable user (`ansible-iac`) so Ansible can connect after first
reboot. Originally, the ops user, diagnostic packages, `/etc/hosts`, and
service enablement were also done in chroot.

This caused problems:

- Chroot operations are fragile -- bind mounts for `/dev`, `/proc`, `/sys`
  must be set up and torn down correctly. More chroot work means more failure
  surface during provisioning.
- The ops user password comes from 1Password (resolved at play time via
  `op inject` — see ADR-009). Embedding it in the chroot phase means
  provisioning depends on the operator's 1P session being live during
  install, which complicates the live-image environment.
- Post-provision drift (stale `/etc/hosts`, missing packages, changed
  passwords) required re-provisioning from the live image to fix. There was
  no way to converge config on a running system.

## Decision

The `provision_host` role now creates only `ansible-iac` (uid 1000, locked
password, key-only SSH, NOPASSWD sudo) inside chroot. Everything else moved
to a separate **baseline** role that runs post-boot via the normal Ansible
pipeline:

- `users.yml` -- ops user with op-injected password, sudo config
- `packages.yml` -- podman ecosystem, diagnostic tools
- `system.yml` -- `/etc/hosts` template, service enablement, timezone

The baseline role is convergeable: re-running it on a live system corrects
drift without re-provisioning.

## Consequences

- **Positive:** Provisioning is faster and less fragile -- fewer chroot
  operations, no vault dependency during OS install.
- **Positive:** Password changes, package additions, and `/etc/hosts` updates
  are applied by re-running `baseline.yml` against running nodes. No reboot
  or live-image cycle needed.
- **Positive:** Clear responsibility boundary: provision_host owns
  "bare metal to bootable OS", baseline owns "bootable OS to operational node".
- **Negative:** Two-step initial setup (provision, then baseline) instead of
  one. Mitigated by the `site.yml` playbook which chains both.
