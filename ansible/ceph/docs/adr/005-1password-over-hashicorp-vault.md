# ADR-005: 1Password CLI over HashiCorp Vault

## Status

Superseded by [ADR-009](./009-tf-first-op-inject-over-vault-password-sh.md).

The core decision (1Password over HashiCorp Vault) stands — the team already
runs on 1P for credentials, and a self-hosted Vault server wasn't justified
for this scale. What's changed is the *mechanism*: the `vault-password.sh`
script + `ansible-vault` + `vault.yml` pipeline described below has been
retired in favor of TF-provisioned 1P items + `op inject` at playbook time.
See ADR-009 for the current implementation. This document is preserved for
historical context on the Vault-vs-1P choice.

## Context

The Ansible playbooks need secrets: vault passwords for encrypted vars files,
dashboard credentials, ops user passwords, and S3 keys. The standard options
are:

- `ansible-vault` with a password file or `--ask-vault-pass` -- simple but
  the vault password itself needs to live somewhere (plaintext file, env var,
  or manual entry every run).
- HashiCorp Vault -- powerful but requires its own infrastructure (server,
  unsealing, token management, HA). Overkill for a small team managing a few
  clusters.
- 1Password -- already used by the team for credential management. Has a CLI
  (`op`) with service account tokens for CI and desktop app integration for
  developer workstations.

## Decision

Secrets are managed in 1Password. The `vault-password.sh` script is the
Ansible `vault_password_file`. It fetches the vault password from a 1Password
item, trying four auth methods in order:

1. Service account token (`OP_SERVICE_ACCOUNT_TOKEN`) for CI/headless.
2. Desktop app integration (polkit/YubiKey) for developer workstations.
3. Interactive prompt as TTY fallback.
4. Dummy password for lint/syntax-check (no TTY, no `op`).

A companion `secrets-init.sh` script bootstraps all 1Password items for a new
cluster (vault password, dashboard login, grafana login, ops user) with
auto-generated passwords and multi-URL entries for browser autofill. Items
are stored in a dedicated "Yucca" vault and named by cluster FQDN.

## Consequences

- **Positive:** No additional infrastructure to manage. 1Password is already
  the team's credential store -- secrets live alongside other org credentials.
- **Positive:** YubiKey/biometric unlock on workstations means no plaintext
  password files on disk. Service account tokens provide headless CI access.
- **Positive:** `secrets-init.sh` makes cluster credential bootstrapping
  repeatable -- new clusters get consistent 1Password items automatically.
- **Negative:** Hard dependency on 1Password CLI (`op`). Mitigated by the
  interactive and dummy fallbacks in `vault-password.sh`.
- **Negative:** 1Password is a SaaS dependency. Acceptable trade-off vs.
  self-hosting HashiCorp Vault for a small operations team.
