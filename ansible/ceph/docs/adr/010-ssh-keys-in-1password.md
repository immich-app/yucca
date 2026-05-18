# ADR-010: SSH Keys in 1Password (Native Category, Forward-Only Rotation)

## Status

Accepted (2026-04-22). Complements [ADR-009](./009-tf-first-op-inject-over-vault-password-sh.md)
(TF-first secrets) by applying the same "1P is the storage layer" model to
SSH keys.

## Context

Before this ADR, the `ansible-iac` SSH keypair for each cluster lived only on
operator workstations — `~/.ssh/id_ed25519_sietch-ceph` and
`~/.ssh/id_ed25519_ceph-painbox-lab-hel-htz`. Implications:

1. **No durable storage** — a laptop loss meant the private key was
   gone; re-access required provisioning a new key and manually
   distributing the pubkey to every host.
2. **No clean onboarding path** — adding a new operator required
   out-of-band key sharing (insecure) or cutting them a separate key
   pair (possible but undocumented).
3. **Remote-hands operators** had no scripted path to get cluster SSH
   access beyond an out-of-band share of the private key.
4. **Inconsistent with the rest of the secrets model** — passwords live
   in `yucca_tf_dev`, but SSH keys lived only on disk. Operators had to
   remember two different security boundaries.

1Password has native `SSH Key` category support: items store the private
key, automatically derive the public key, and integrate with 1P SSH Agent
on workstations (already configured globally on the primary operator's
machine — `Host * IdentityAgent ~/.1password/agent.sock` in
`~/.ssh/config`).

## Decision

SSH keys join the hybrid secrets model:

1. **New keypairs are generated natively in 1P** via
   `op item create --category "SSH Key" --ssh-generate-key=ed25519`. Private
   key never touches operator disk during generation.
2. **Items live in `yucca_tf_dev`** with title
   `<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY` (SHOUTY_SNAKE_CASE, same scheme
   as password items).
3. **Public keys are consumed by Ansible at play time** via
   `op read "op://yucca_tf_dev/<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY/public_key"`
   in a new `rotate-ssh-key.yml` playbook, which ensures the current
   pubkey is present in `ansible-iac@<host>:~/.ssh/authorized_keys`
   (additive — doesn't remove others).
4. **Private keys reach operator workstations** via
   `scripts/install-ssh-keys.sh` (idempotent `op read` → `~/.ssh/`,
   refuses to overwrite on fingerprint mismatch).
5. **Rotation is forward-only**: new keys are generated, distributed,
   verified; old keys are cleaned up manually (SSH in, delete from
   authorized_keys, delete disk files) after confidence.

## Out of scope (for this ADR)

- **TF-managed SSH key resources.** Attempted earlier but op CLI's
  import path for SSH Keys produces malformed items (accepts
  private_key on create, strips the field on retrieval). Verified
  against op `2.34.0`. Generation via `--ssh-generate-key` works
  correctly. Future ADR may move generation into TF via
  `onepassword_item` with `tls_private_key` — but that path puts the
  private key into TF state, which is a step backwards for this
  particular category.
- **1Password SSH Agent as the primary transport.** Operator workstations
  may already have it globally configured (recommended), but ansible
  inventory still references explicit `ansible_ssh_private_key_file`
  paths. A future change could
  drop the path entirely and rely on `IdentityAgent` routing — defer
  until we've run under the new keys long enough to trust the agent
  path.
- **CI integration.** No CI pipeline runs Ansible yet. When that
  lands, CI would authenticate with the read-only SA, `install-ssh-keys.sh`
  pulls keys into a CI-scoped `~/.ssh/`. Separate PR.

## Consequences

- **Positive:** keys are durable (laptop loss is a non-event), rotatable
  (regenerate in 1P via `op item edit --ssh-generate-key`), auditable
  (1P logs reads), and scoped (read-only SA can pull them, superuser SA
  can rotate them).
- **Positive:** remote-hands onboarding is a documented `scripts/install-ssh-keys.sh`
  invocation — no insecure key-over-chat.
- **Positive:** consistent with ADR-009. Operators have one mental
  model: `op://<vault>/<ITEM>/<field>`, whether it's a password or a
  key.
- **Negative:** op CLI can't import existing SSH keys reliably into the
  `SSH Key` category (bug in 2.34.0). Rotation is the only way in —
  existing keys are retired, not migrated. Operationally fine; makes
  "put my personal bastion key in 1P" harder.
- **Negative:** ansible `rotate-ssh-key.yml` depends on `op` running on
  the controller (already required by `scripts/ansible-play.sh`). Not
  a new dependency, but does mean the key-rotation playbook can't run
  offline.
- **Neutral:** private keys exist on operator disks during the
  transition between `install-ssh-keys.sh` and adoption of 1P SSH
  Agent as the sole transport. Files are `0600` and same security
  properties as the pre-ADR state.

## Migration that landed with this ADR

- New items `SIETCH_CEPH_ANSIBLE_IAC_SSH_KEY` and
  `PAINBOX_CEPH_ANSIBLE_IAC_SSH_KEY` generated in `yucca_tf_dev`.
- `clusters.auto.tfvars` `ansible_ssh_key` and
  `inventories/<cluster>/group_vars/all/vars.yml` `provision_iac_ssh_key_path`
  updated to `~/.ssh/id_ed25519_sietch` and `~/.ssh/id_ed25519_painbox`.
- Rendered `inventory.ini` (all variants) and `secrets.yml.tpl` reflect
  the new key paths after `tofu apply`.
- `scripts/install-ssh-keys.sh` added for operator-side key install.
- `rotate-ssh-key.yml` playbook added for pubkey distribution.
- End-to-end rotation verified against sietch: `install-ssh-keys.sh`
  pulled the new keypair to the operator workstation,
  `rotate-ssh-key.yml` distributed the public key to all three nodes'
  `ansible-iac:~/.ssh/authorized_keys` (exclusive: false — additive),
  and a subsequent `ansible -m ping` against the cluster succeeded
  using the new key. Old per-operator keypairs
  (`id_ed25519_sietch-ceph`, `id_ed25519_ceph-painbox-lab-hel-htz`) are
  retired — delete from disk at operator convenience. Painbox's old
  key is irrelevant post-reprovision.

## References

- [ADR-009](./009-tf-first-op-inject-over-vault-password-sh.md) — companion, TF-first secrets
- `scripts/install-ssh-keys.sh` — the operator-side tool
- `rotate-ssh-key.yml` — the host-side distribution playbook
- [1Password SSH Agent docs](https://developer.1password.com/docs/ssh/agent/)
