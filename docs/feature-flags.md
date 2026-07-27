# Feature flags

Per-user product gating for yucca. The system is built so it lasts: **the set
of flags is code, the state of flags is data.**

## Model

- **Registry (code)** — `packages/common/src/features.ts`, exported from
  `@common/server` as `FeatureFlags`. Each entry has a `key`, a boolean
  `default`, a `stage`, a `description`, and the `since` version. This is the
  single source of truth for what flags exist and what they default to.
- **Overrides (data)** — the `userFeatureFlagOverride` table (one row per
  deliberate per-user decision): `(userId, flag)` unique, a boolean `value`,
  plus `setBy` (the admin `sub`) and `reason` for the audit trail.
- **Resolution** — everywhere, a user's effective flags are
  `resolveFeatures(overrides)`: the override wins, otherwise the registry
  default. Overrides for flags no longer in the registry are ignored.

Adding a flag is a one-object change in the registry — no migration. Clearing a
user's override reverts them to the registry default, which is **not** the same
as setting an override to `false` (a `false` override is a deliberate opt-out /
kill-switch that survives a GA default flip).

## Where it's enforced and surfaced

- **yucca-api** gates routes with `@RequireFeature('<key>')` stacked on
  `@AuthRoute()` (403 when off), and returns the resolved flags on `GET /auth`
  as `features: Record<string, boolean>` — so web, the orchestrator SDK, and
  fubar all read the same resolved state.
- **Device flow** honors flags too: a non-immich `consumer_type` on
  `/auth/oidc/device` fails with `FEATURE_NOT_ENABLED` unless `multi-consumer`
  is on.

## Lifecycle (`stage`)

| Stage | Default | Meaning |
|---|---|---|
| `experimental` | off | manual per-user overrides only |
| `beta` | off | manual + cohort enrollment (`features enable-batch`) |
| `ga` | on | default flipped in the registry via a release; `false` overrides act as opt-outs |
| `retired` | — | gate code deleted; prune orphaned override rows |

GA is a code change that ships as a release (matching how prod promotion already
works), not a runtime toggle — so "what does user X get?" is always answerable
from the registry plus their override row.

## Managing flags (yuctl)

```bash
yuctl features list                          # registry: defaults, stages, override counts
yuctl features users multi-consumer          # who has an override, set by whom, why
yuctl users features list <email>            # one user's resolved flags + overrides
yuctl users features set <email> multi-consumer on --reason "beta cohort 1"
yuctl users features clear <email> multi-consumer
yuctl features enable-batch multi-consumer 50   # oldest 50 users without an override
```

Batch enrollment orders by `users.createdAt` then `id` (users predating the
consumer migration share `2026-01-01`, tie-broken by id).

## The boundary rule (why this isn't a config junk drawer)

- **env / cluster-settings** = *deployment* config: per-partition, ops-owned,
  needs a deploy to change (e.g. `REDIS_ADDR`, OIDC issuer, replica counts).
- **feature flags** = *per-user product gating*: runtime, admin-owned, no deploy.

A flag never reads from env; an env var never varies per user. Keep them
separate and the system stays legible.
