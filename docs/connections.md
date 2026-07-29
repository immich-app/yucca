# Connections

A **connection** is what backs up a user's account. It makes "what is using this
account" first-class, so usage can be attributed and billed per source and so a
user can run more than one backup client against one account.

```
User ──1:N──> Connection ──1:N──> Repository ──1:1──> S3 bucket (via michael)
```

- **User** — the account and **billing unit** (plan/quota live here).
- **Connection** — attribution + capability + billing-rollup unit. Carries a
  `type`; device-flow sessions bind to one; usage rolls up here.
- **Repository** — the restic repo / bucket; per-repo metering happens here
  (`repositoryMeter`). Every repository has a NOT-NULL `connectionId`.

Connection→Repository is 1:N (a restic connection is reused across repositories);
a repository belongs to exactly one connection. `POST /connections/:id/adopt`
re-parents a repository that still sits on the user's **default** connection.

## Types (a code registry)

The set of connection types and their behavior is **code**, not data — only
per-user/instance state is data. The descriptor lives in
`packages/common/src/connections.ts` (`ConnectionTypeInfos`), exported from
`@common/server`. Adding a type is a one-object change there.

| Type | Metering tiers | Reports activity | Min object size | Revocable | Self-serve flag |
|---|---|---|---|---|---|
| `immich` | storage, transfer, activity | yes | 0 | no | none (always on) |
| `restic` | storage, transfer | no | 1 MiB | yes | `connection-restic` |
| `s3` *(future)* | storage | no | 1 MiB | yes | — |

### Metering tiers

Billing keys off **storage**, the only universal tier.

| Tier | Source | immich | restic | s3 |
|---|---|---|---|---|
| **Storage** (bytes, objects) → **billed** | RadosGW | ✅ | ✅ | ✅ |
| Transfer | michael | ✅ | ✅ | ❌ |
| Activity (backup start/end) | client | ✅ | ❌ | ❌ |

## Billing rollup

`yucca-metrics-worker` meters each repository from RadosGW every 5 minutes, then
rolls the readings up per connection into the `connectionMetrics` table
(`sizeBytes`, `objectCount`, `billableBytes`, `repositoryCount`). `GET /connections`
returns the rollup per connection.

**Billable bytes** apply a per-type object-size floor via
`billableBytes(type, sizeBytes, objectCount)`:

```
billableBytes = max(sizeBytes, objectCount * minObjectSizeBytes)
```

immich is exempt (floor 0 → billed at raw size). Non-immich types bill each
object at a minimum of 1 MiB. RadosGW exposes only total size + object count (no
per-object histogram), so this is an **aggregate approximation** of
`Σ max(objectSize_i, 1 MiB)` — it under-counts a repo that mixes large and small
objects, but restic writes large pack files so `sizeBytes` dominates and the
floor only bites for tiny/new repos or many-small-object raw-S3, the intended
cases. Exact per-object billing (S3 `ListObjects`) is a documented future option.

*(This produces billable-bytes only. Pricing/plan/quota is a separate later layer.)*

## Revocation: cached validity, bounded grace

restic tokens are long-lived, so revocation is a **positive validity check**, not
a fail-open denylist. Redis holds a marker `yucca:restic:valid:<jti>` for every
live token; michael treats **present = valid, absent = revoked/unknown → denied**.

- **Mint** (`yucca-api` / `yucca-admin-api`) writes the marker with an EXAT that
  tracks the token's expiry — but only for **revocable** types (restic). michael
  **skips** the check for non-revocable types (immich, whose access rides the
  device-flow session), so an absent marker never wrongly denies them.
- **Revoke** deletes the marker. michael honors its short in-memory **fresh**
  cache (`REVOCATION_FRESH_TTL_MS`, default 60 s), so a revoke takes effect within
  that window.
- **Redis outage**: michael keeps honoring a *previously-valid* jti until a
  bounded **grace** window elapses (`REVOCATION_GRACE_MS`, default 5 min), then
  fails **closed**. A jti never confirmed valid (revoked, unknown, or first-seen
  during the outage) is denied immediately — bounded grace, then deny.
- `yucca-metrics-worker` reconciles markers with the DB at bootstrap and every
  5 min, in **both directions**: it re-asserts markers for valid (unrevoked,
  unexpired) tokens of revocable types, and **deletes** stale markers for
  revoked-but-unexpired tokens (healing a revoke whose inline `DEL` failed). So
  Redis stays ephemeral: a flush or divergence heals within one tick. Residual
  window: a *restarted* (empty-but-reachable) Redis denies valid restic tokens
  until the next reconcile tick — grace only covers *unreachable* Redis.

michael enforces validity only where `REDIS_ADDR` is set (primary regions);
`REVOCABLE_CONNECTION_TYPES` (default `restic`) mirrors the descriptor's
`revocable` set. Secondary regions have no marker-population path and run with
validity checking off.

## Self-serve restic

A user with the `connection-restic` flag can stand up a restic backup in one call:

- **`POST /connections/restic`** — get-or-create the user's restic connection,
  create a repository under it, mint a **long-lived** rest: URL, and return
  `{ connection, repository, url, jti, expiresAt }`. Idempotent on the connection
  (reused across repositories). Gated on `connection-restic` (403 without).
- **`POST /repository/:id/restic`** — mint a URL for an existing repository.
  Optional `expiresIn` and `label`. **Long-lived tokens are revocable-only**: for
  restic repositories the default is `RESTIC_JWT_EXPIRES_IN` (90d), capped at
  `RESTIC_JWT_MAX_EXPIRES_IN` (365d); for non-revocable types (immich — michael
  never validity-checks them) the token keeps the short session-JWT lifetime
  (`JWT_EXPIRES_IN`, 1d) and a custom `expiresIn` is rejected.
- **`GET /repository/:id/restic-tokens`** — list a repository's minted tokens
  (owner-scoped).
- **`DELETE /restic-tokens/:jti`** — revoke your own token (owner-scoped; unknown
  or other-owner jtis 404 identically, so ownership isn't leaked). Clears the
  validity marker.

The `/connections` surface (list, create, adopt, manage) is open to **every**
authenticated user; only the individual non-default *type* is flag-gated. Admin
provisioning (`yucca-admin-api`, yuctl) bypasses the flag (admin authority).

## Web UI

The `Connections` dashboard page (`packages/web/src/routes/dashboard/connections/`)
lists each connection with its type and usage rollup. It's a thin SvelteKit route:
`+page.ts` loads `listConnections` + `getRepositories` via the generated client, and
`+page.svelte` renders it with `@immich/ui`.

**Restic self-serve is invisible without the flag.** The "New restic backup" button and
all restic actions render only when `data.user.features['connection-restic']` is true —
absent from the DOM otherwise, not merely disabled. The create flow (`CreateResticModal`)
calls `POST /connections/restic` and opens a result modal (`ResticResultModal`) showing the
`rest:` URL, a `restic -r … init` snippet (copy buttons), and a repository-password
reminder. Per-repository access keys are listed/revoked/re-minted in `ManageTokensModal`.

## Where things live

| Concern | Location |
|---|---|
| Type descriptor + billing floor | `packages/common/src/connections.ts` |
| Schema (`connections`, `connectionMetrics`, `resticTokens`) | `packages/yucca-api/src/schema/` |
| Connection + self-serve restic API | `packages/yucca-api/src/{controllers,services}/` |
| Web Connections page + restic modals | `packages/web/src/routes/dashboard/connections/`, `packages/web/src/lib/components/connections/` |
| Billing rollup | `packages/yucca-metrics-worker/` |
| Validity check (michael) | `packages/michael/internal/revocation/` |
| Admin provisioning | `packages/yucca-admin-api/`, `packages/yuctl/` |
