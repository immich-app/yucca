# ADR-009: TF-First Authority + `op inject` over ansible-vault

## Status

Accepted (2026-04-22). Supersedes the implementation portions of [ADR-005](./005-1password-over-hashicorp-vault.md);
the "1Password over HashiCorp Vault" decision itself stands.

## Context

ADR-005 landed `vault-password.sh` (4-tier auth fallback) + `ansible-vault`
+ committed-encrypted `vault.yml` + `secrets-sync.sh` as the secrets
mechanism. Over time this accumulated friction:

1. **Silent-failure footgun**: `vault-password.sh` fell back to a dummy
   password when 1Password was unavailable and no TTY was present. This
   masked real auth failures — plays ran with wrong secrets until a task
   that used them downstream blew up with a confusing error.
2. **Two source-of-truth problem**: secrets lived both in 1Password (master)
   and in `vault.yml` (cache). `secrets-sync.sh` reconciled them but the
   reconciliation step was easy to forget.
3. **Cluster identity authority**: `assign-names.py`, `vault-password.sh`,
   `secrets-init.sh` all derived cluster identity from the inventory
   directory path — operator-authored. Naming drift between scripts was a
   recurring gotcha.
4. **Move to yucca monorepo**: migrating `sietch-ceph-dev-austin-int-futo-cloud`
   into the `immich-apps/yucca` monorepo made the existing ad-hoc bash
   scripting look out of place next to the Immich devtools pattern already
   in use for other Futo infra (TF + 1P, `op run --env-file`, terragrunt).
5. **Painbox reprovision** surfaced that the Ansible layer's implicit
   cluster-identity (host names, inventory paths) was hard to change — TF
   as the authority makes identity a declarative input.

## Decision

**TF is the authority for cluster identity and 1P-item lifecycle; Ansible
is a consumer.** Specifically:

1. **Cluster + host identity** declared in `tf/deployment/<env>/<stack>/clusters.auto.tfvars`.
   TF renders `inventory.ini`, `inventory-destroy.ini`, `inventory-provision.ini`,
   and `secrets.yml.tpl` per cluster via `templatefile()` + `local_file`
   resources.
2. **1P items** live in the `yucca_tf_*` team-shared vaults. Item names
   follow `<CLUSTER>_CEPH_<ROLE>_*` (SHOUTY_SNAKE_CASE, `CEPH` hardcoded —
   project-scoped, not hostname-role-scoped). TF-managed `onepassword_item`
   resources are currently **dormant** in `secrets.tf.disabled` — items are
   created today via the `op` CLI (operator runs `op item create` once per
   cluster; see `docs/adding-a-cluster.md` §6). Re-enable once the
   dedicated ceph-scoped service account replaces the org-wide superuser SA.
3. **Ansible consumption** via `scripts/ansible-play.sh`, which:
   - Verifies `op account get` succeeds (fails closed).
   - Renders the cluster's `secrets.yml.tpl` (op:// references → real
     values) via `op inject -f` into a `0600` tmpfile cleaned by `trap`.
   - Execs `ansible-playbook --extra-vars @<tmpfile>`.
4. **Service-account split**: superuser SA writes items (TF); read-only SA
   reads items (Ansible runtime + CI). Both SAs live as 1P items in
   `yucca_tf_dev`; `tf/.env` holds their `op://` references — resolved at
   invocation time via `op run --env-file=tf/.env -- terragrunt ...`.
5. **Terragrunt multi-env** layout (`tf/deployment/<env>/<stack>/` with root
   `terragrunt.hcl`). State backend is S3 against the shared `yucca-tf-state`
   bucket at OVH Paris, keyed `ceph/${env}/${stack}/terraform.tfstate` —
   project-scoped so ceph state doesn't collide with o11y or future stacks.
   State locking (`use_lockfile`) deferred — OVH has no DynamoDB equivalent,
   and OpenTofu's lockfile-object mode fails on fresh backends with a 404
   before it can create one. Single-operator workflow today; revisit when
   concurrent applies become likely.

## Consequences

- **Positive:** No ansible-vault. No `vault.yml`. No `vault-password.sh`.
  No `secrets-sync.sh`. No `secrets-init.sh`. No dummy-password fallback.
  No reconciliation step. Rotation = edit 1P item (or `terragrunt taint`),
  next play run picks it up.
- **Positive:** Cluster identity is declarative. Adding a cluster or host is
  an HCL edit + `tofu apply`. TF renders everything Ansible needs to
  consume.
- **Positive:** CI lint and syntax-check don't require 1P access — ansible
  parsing doesn't hit secrets until play-execution.
- **Positive:** Aligns with Immich devtools conventions — same `op run
  --env-file=` pattern, same TF+1P module shape, same vault naming
  structure (yucca_tf_*).
- **Negative:** `op` CLI must be available on every control node; no
  offline/airgap fallback. Operationally acceptable.
- **Negative:** TF state now gates Ansible runs — rendered files must exist
  before `ansible-playbook` has inputs. Mitigated by running `tofu apply`
  as the one-time bootstrap step (gitignored outputs re-render on demand).
- **Negative:** Two service-account tokens to manage (read-only + superuser).
  Shared with o11y and other Futo consumers via `yucca_tf_dev` — rotation
  coordination required (see `docs/runbooks/rotate-sa-token.md`).

## Future direction

The TF-renders-Ansible-consumes pattern this ADR establishes for inventory
and secrets extends naturally to cephadm service specs. [ADR-011](./011-cephadm-osd-service-specs.md)
takes the first step (OSDs) — `osd-spec.yml.j2` is currently rendered by
Ansible from per-host data. A logical next step ("Option C" in the
architecture session log) is to move spec rendering into TF itself, so
TF emits `inventory.ini` + `secrets.yml.tpl` + the full set of cephadm
service specs (host registration, MON/MGR placement, OSD, RGW, monitoring)
as a coherent set of artifacts. The Ansible role becomes a thin applier:
`ceph orch apply -i <each-spec>`. Tracked as a follow-up PR after the
import lands.

## References

- `tf/shared/modules/ceph-cluster/` — the module that renders inventories
  and (when re-enabled) provisions 1P items.
- `tf/deployment/dev/ceph/` — the dev-env declaration.
- `scripts/ansible-play.sh` — the Ansible-consumer wrapper.
- `docs/secrets.md` — end-user documentation of the model.
- [ADR-011](./011-cephadm-osd-service-specs.md) — first cephadm-spec
  refactor (OSD path).
- [Immich devtools](https://github.com/immich-app/devtools) `tf/shared/modules/secrets/` — upstream pattern we copied.
