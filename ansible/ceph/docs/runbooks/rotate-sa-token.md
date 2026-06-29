# Runbook: Rotate 1Password Service Account Token

**When:** token leak, team personnel change, or scheduled rotation.

**Time estimate:** 15-30 minutes including any cross-team coordination.

**Blast radius:** every CI run for the affected partition fails until the new
token is in place. Coordinate before rotating if the service account is shared
with other consumers.

---

## Prerequisites

- 1Password access to create/revoke service-account tokens (the 1Password
  service-account console, not a vault item).
- GitHub repo admin to update the Actions secrets.
- A heads-up to anyone else consuming the same service account.

## Which token to rotate

Each partition has a **read** and a **write** service account, delivered to CI
as GitHub repo secrets:

| Partition | Read SA (plan)            | Write SA (apply)                |
|-----------|---------------------------|---------------------------------|
| staging   | `OP_TF_YUCCA_STAGING_ENV` | `OP_TF_YUCCA_STAGING_ENV_WRITE` |
| prod      | `OP_TF_YUCCA_PROD_ENV`    | `OP_TF_YUCCA_PROD_ENV_WRITE`    |

`plan` jobs use the read token; `apply` jobs use the write token. Rotating a
read token has lower blast radius than a write token. dev is local-only and
has no CI service account.

## Steps

1. **Announce** to anyone sharing the service account (Discord). Expect a brief
   window where that partition's CI fails until the secret is updated.
2. **Create a replacement token** in the 1Password service-account console with
   the same vault scope as the one being rotated. Give it a dated label so old
   and new coexist briefly.
3. **Update the GitHub repo secret** for the affected partition/role
   (`OP_TF_YUCCA_<PARTITION>_ENV` and/or `..._ENV_WRITE`) with the new token
   value. (Settings → Secrets and variables → Actions.)
4. **Test**:
   - CI: re-run `Infra (Terraform)` — `plan` exercises the read token, a gated
     `apply` exercises the write token.
   - Local: `OP_SERVICE_ACCOUNT_TOKEN=<new token> tf/op-run.sh terragrunt
     --working-dir tf/deployment/<partition>/<region>/ceph plan`.
5. **Revoke the old token** in the 1Password console once CI is green.

## Recovery: rotation broke something

- New token rejected / empty `op vault list`: the new SA doesn't have the same
  vault scopes as the old. Recreate it with matching scope.
- CI still failing after the secret update: confirm you updated the right
  partition's secret (`OP_TF_YUCCA_<PARTITION>_ENV` vs `..._ENV_WRITE`) and
  re-ran the workflow so it re-reads the secret.
- Roll back: set the GitHub secret back to the old token value — the old SA
  stays valid until you explicitly revoke it in the console.

## References

- `.github/workflows/infra.yml` — injects `OP_SERVICE_ACCOUNT_TOKEN` per job
  from these secrets (read for plan, write for apply).
- `tf/README.md` §"Where secrets actually live" — describes the SA scopes.
