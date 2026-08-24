# Connections

A **connection** is what backs up a user's account. It makes "what is using this
account" first-class, so usage can be attributed and billed per source and so a
user can run more than one backup client against one account.

```
User ──1:N──> Connection ──1:N──> Repository ──1:1──> S3 bucket (via michael)
```

- **User**, the account and **billing unit** (plan/quota live here).
- **Connection**, attribution + capability + billing-rollup unit. Carries a
  `type`; device-flow sessions bind to one; usage rolls up here.
- **Repository**, the restic repo / bucket; per-repo metering happens here
  (`repositoryMeter`). Every repository has a NOT-NULL `connectionId`.

Connection→Repository is 1:N (a restic connection is reused across repositories);
a repository belongs to exactly one connection. `POST /connections/:id/adopt`
re-parents a repository that still sits on the user's **default** connection.

## Types (a code registry)

The set of connection types and their behavior is **code**, not data, only
per-user/instance state is data. The descriptor lives in
`packages/common/src/connections.ts` (`ConnectionTypeInfos`), exported from
`@common/server`. Adding a type is a one-object change there.

| Type | Metering tiers | Reports activity | Min object size | Revocable | Self-serve flag |
|---|---|---|---|---|---|
| `immich` | storage, transfer, activity | yes | 0 | no | none (always on) |
| `standalone` | storage, transfer, activity | yes | 1 MiB | no | none (always on) |
| `restic` | storage, transfer | no | 1 MiB | yes | `connection-restic` |
| `s3` *(future)* | storage | no | 1 MiB | yes |, |

### Metering tiers

Billing keys off **storage**, the only universal tier.

| Tier | Source | immich | standalone | restic | s3 |
|---|---|---|---|---|---|
| **Storage** (bytes, objects) → **billed** | RadosGW | ✅ | ✅ | ✅ | ✅ |
| Transfer | michael | ✅ | ✅ | ✅ | ❌ |
| Activity (backup start/end) | client | ✅ | ✅ | ❌ | ❌ |

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

immich is exempt (floor 0 → billed at raw size). Every other type, standalone
included, bills each object at a minimum of 1 MiB. RadosGW exposes only total
size + object count (no per-object histogram), so this is an **aggregate
approximation** of
`Σ max(objectSize_i, 1 MiB)`, it under-counts a repo that mixes large and small
objects, but restic writes large pack files so `sizeBytes` dominates and the
floor only bites for tiny/new repos or many-small-object raw-S3, the intended
cases. Exact per-object billing (S3 `ListObjects`) is a documented future option.

*(This produces billable-bytes only. Pricing/plan/quota is a separate later layer.)*

## Revocation: postgres truth, layered caches, bounded grace

restic tokens are long-lived, so their liveness is checked against the **source
of truth, postgres** (`resticTokens`), fronted by yucca-api's internal
introspection endpoint and two cache layers in michael:

```
michael request ──> L1 (per-process, fresh 60s / grace 30min)
                      └miss──> L2 (shared valkey, yucca:michael:verdict:<jti>, TTL 5min)
                                 └miss/error──> GET yucca-api /internal/restic-tokens/:jti  (postgres)
```

- **Introspection** (`GET /internal/restic-tokens/:jti`, shared-secret header
  `X-Introspection-Secret`) answers `{active}`: minted, unrevoked, unexpired,
  **owner enabled** (disabling an account kills its credentials; re-enabling
  restores unexpired ones). Unknown, malformed, revoked, expired, and
  disabled-owner jtis all answer `active:false`.
  The route is **unreachable from the public internet**: the gateway
  short-circuits `/api/internal/*` to a bare 404 (`HTTPRouteFilter
  internal-404` shadowing the `/api` rule), so only pod-to-pod traffic,
  admitted by `allow-ingress-yucca-api`, ever reaches it; the shared secret
  is the second wall, not the only one.
- **Mint** writes only the postgres row, no cache writes; the first request
  populates the caches read-through.
- **Revoke** flips the DB row, then best-effort **DELs the L2 verdict key**,
  the revoke lands on every michael replica within ~the L1 fresh TTL
  (`REVOCATION_FRESH_TTL_MS`, default 60 s). A *missed* DEL self-heals when the
  L2 entry's TTL (`VERDICT_CACHE_TTL_MS`, default 5 min) lapses and the next
  miss re-asks postgres, no reconcile job exists or is needed.
- **Valkey restart/outage is harmless**: L2 is pure cache, a miss or error
  falls through to introspection. (This is why the old marker model's
  restart-deny-window and reconcile cron are gone.)
- **Introspection outage** (yucca-api/postgres unreachable): michael keeps
  honoring a *previously-valid* jti until a bounded **grace** window elapses
  (`REVOCATION_GRACE_MS`, default 30 min), then fails **closed**. The horizon is
  anchored to the last *authoritative* confirmation (L2 hits carry the entry's
  age via PTTL), so 30 min is a true end-to-end bound; repeated failures are
  also debounced (a short backoff gates introspection dials, so an outage never
  turns restic's request concurrency into a control-plane storm). A jti never
  confirmed valid is denied immediately, bounded grace, then deny.
- michael **skips** the check entirely for non-revocable types (immich, whose
  access rides the device-flow session): `REVOCABLE_CONNECTION_TYPES` (default
  `restic`) mirrors the descriptor's `revocable` set.

michael enforces validity only where `TOKEN_INTROSPECTION_URL` is set (primary
regions, secondaries have no local yucca-api and run with checking off). The
valkey is the **generic shared platform cache** (`charts/apps/redis`, ephemeral
by design, keys namespaced `yucca:<service>:<purpose>:*`); the verdict cache is
its first tenant, with michael rate limiting a likely second.

## Self-serve restic

A user with the `connection-restic` flag can stand up a restic backup in one call:

- **`POST /connections/restic`**, get-or-create the user's restic connection,
  create a repository under it, mint a **long-lived** rest: URL, and return
  `{ connection, repository, url, jti, expiresAt }`. Idempotent on the connection
  (reused across repositories). Gated on `connection-restic` (403 without).
- **`POST /repository/:id/restic`**, mint a URL for an existing repository.
  Optional `expiresIn` and `label`. **Long-lived tokens are revocable-only**: for
  restic repositories the default is `RESTIC_JWT_EXPIRES_IN` (90d), capped at
  `RESTIC_JWT_MAX_EXPIRES_IN` (365d); for non-revocable types (immich, michael
  never validity-checks them) the token keeps the short session-JWT lifetime
  (`JWT_EXPIRES_IN`, 1d) and a custom `expiresIn` is rejected.
- **`GET /repository/:id/restic-tokens`**, list a repository's minted tokens
  (owner-scoped).
- **`DELETE /restic-tokens/:jti`**, revoke your own token (owner-scoped; unknown
  or other-owner jtis 404 identically, so ownership isn't leaked). Invalidates
  michael's cached verdict.

The `/connections` surface (list, create, adopt, manage) is open to **every**
authenticated user; the individual non-default *type* is flag-gated on every
**credential-creating** operation, creating a connection of the type, creating
a repository under one, and minting a URL, so a `false` override is a real
kill-switch for new self-service credentials (existing tokens keep working until
revoked or expired; **revoke and list are deliberately never gated**). Admin
provisioning (`yucca-admin-api`, yuctl) bypasses the flag (admin authority).

## Web UI

The `Connections` dashboard page (`packages/web/src/routes/dashboard/connections/`)
lists each connection with its type and usage rollup. It's a thin SvelteKit route:
`+page.ts` loads `listConnections` + `getRepositories` via the generated client, and
`+page.svelte` renders it with `@immich/ui`.

**Restic self-serve is invisible without the flag.** The "New restic backup" button and
all restic actions render only when `data.user.features['connection-restic']` is true,
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
| Validity check (michael: L1/L2/introspection) | `packages/michael/internal/revocation/` |
| Introspection endpoint | `packages/yucca-api/src/controllers/introspection.controller.ts` |
| Admin provisioning | `packages/yucca-admin-api/`, `packages/yuctl/` |
