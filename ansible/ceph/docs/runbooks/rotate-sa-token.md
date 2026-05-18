# Runbook: Rotate 1Password Service Account Token

**When:** token leak, team personnel change, or scheduled rotation.

**Time estimate:** 15-30 minutes including cross-team coordination.

**Blast radius:** **cross-project**. The SA tokens in `yucca_tf_dev` are
shared with o11y and other Futo consumers. Rotating breaks every consumer
until they pick up the new token.

---

## Prerequisites

- Coordination with other consumers of the SA (at minimum: o11y team,
  whoever else uses `yucca_tf_*`). Ask in Discord before rotating.
- 1Password access to create a replacement SA token.
- List of repos/CI pipelines that consume the token — so you know who to
  notify to pick up the rotation.

## Which SA to rotate

Two SAs live in `yucca_tf_dev`:

| SA | Scope |
|---|---|
| `yucca_futo_1pass_superuser_service_account` | read+write all yucca_tf_* vaults |
| `yucca_futo_1pass_service_account` | read-only on yucca_tf + yucca_tf_dev |

Sietch-ceph consumes both (TF uses superuser for writes, Ansible uses
read-only for runtime). Read-only rotation has lower blast radius.

## Steps

1. **Announce in Discord** to Immich maintainers + o11y team: "Rotating
   `yucca_futo_1pass_<type>_service_account` at HH:MM. Expect a brief
   window where CI pipelines fail — update your vars after."
2. **Create a new SA token in 1Password Admin UI** with matching scope.
   Give it a dated suffix (e.g. `-2026-04-22`) so old and new coexist
   briefly.
3. **Update the SA's `password` field** in the existing 1P item (so
   consumers reading via `op://yucca_tf_dev/<name>/password` pick up the
   new value with no code change).
4. **Test from this repo**:
   ```bash
   mise run tf:plan  # should succeed with new superuser token
   scripts/ansible-play.sh status.yml  # should succeed with new read-only
   ```
5. **Notify consumers** the rotation is done — they restart any daemons /
   re-pull tokens as needed.
6. **Revoke the old SA token** in 1Password Admin UI once all consumers
   confirm green.

## Recovery: rotation broke something

- If the new token doesn't work: check the new SA has the same vault
  scopes as the old. Empty `op vault list` output under the new token =
  scope misconfigured.
- If a consumer is still using the old token: the item's `password` field
  is the single source of truth; consumers re-reading pick up the new
  value. If a consumer caches the token in its own env (CI secret,
  systemd EnvironmentFile), update that manually.
- Roll back: edit the 1P item's `password` field back to the old token
  value (if you kept a copy). The old SA is still valid until
  explicitly revoked.

## References

- `tf/.env` consumes `op://yucca_tf_dev/yucca_futo_1pass_superuser_service_account/password`
- `tf/README.md` §"Where secrets actually live" — describes the SA scopes
