---
title: Services
description: The services, libraries and packages that make up the Yucca application and how they fit together
order: 3
---

Application code lives under `packages/`. This page lists what each package is, which language and framework it uses, and the shared pieces (API client, database, Go tooling) that tie them together.

## Backend services

Backend services are **NestJS 11 + TypeScript**: controllers → services → repositories, Zod-validated `env.ts`, JWT auth guards via `@AuthRoute()`, OTel from `@common/server` (imported at bootstrap; pino logs, OTLP to `victoria-*`).

| Service                     | Lang       | Role                                                                                                                                                                                   |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yucca-api`                 | NestJS     | User-facing API. Owns auth (OIDC code + device flow, ES256 JWTs), repositories, **DB schema + migrations**.                                                                            |
| `yucca-admin-api`           | NestJS     | Admin API (user/session/repository management). Same DB + JWT validation.                                                                                                              |
| `michael`                   | Go         | **Production** restic REST backend — S3 proxy with JWT verification, WORM enforcement, backend pooling.                                                                                |
| `columbo`                   | Go         | Ticket investigation agent: LLM loop (OpenRouter) over per-user-scoped o11y queries, answers only into staff threads. See [Columbo](/architecture/columbo).                             |
| `monk`                      | Go         | Ceph scrub-backlog exporter: polls `pg ls`, serves measured per-pool scrub-age metrics on `:9284`. Deployed onto mon hosts by ansible, not K8s. See [Monk](/operations/monk).           |
| `restic-api`                | NestJS     | Earlier TS implementation of the restic backend, kept as **reference**; not deployed.                                                                                                  |
| `yucca-metrics-worker`      | NestJS     | 5-min cron: RadosGW usage → meter tables → per-connection rollup (`connectionMetrics`, billing floor), OTel gauges.                                                                     |
| `redis` (valkey)            |            | Shared platform cache (ephemeral; keys `yucca:<service>:<purpose>:*`). Primary-region only.                                                                                            |
| `mock-oidc-provider`        | Node       | Dev/test OIDC IdP (code + device flow).                                                                                                                                                |
| `mock-postmark-provider`    | Node       | Dev/test Postmark API mock; delivers into the Mailpit inbox.                                                                                                                            |
| `common` (`@common/server`) | TS lib     | OTel init, pino repository, **feature-flag registry + connection-type registry**, Postmark `EmailRepository` (`@common/server/email`).                                                  |
| `emails` (`@common/emails`) | Svelte lib | Transactional email templates (better-svelte-email, web theme), prebuilt to JS for the NestJS apps. See [Email](/architecture/email).                                                   |

Connections, feature flags and restic token revocation span several of these services; they are described in [Connections](/architecture/connections) and [Feature flags](/architecture/feature-flags).

## Frontend

`packages/web` is SvelteKit 5 + Tailwind 4, `@immich/ui`, lingui i18n (`mise web:lingui:*`; compiled locales are generated, not edited), generated API client.

## Documentation site

`packages/docs` is this site, [docs.futo.cloud](https://docs.futo.cloud): SvelteKit + `adapter-static`, built as a prerendered static site. Every page is a `src/routes/<section>/<slug>/+page.md` compiled by `@immich/svelte-markdown-preprocess` (front matter `title`/`description`/`order`; sections declared in `src/lib/index.ts`). [Writing documentation](/development/writing-docs) is the authoring guide.

## SDK

`packages/yucca-sdk/` (orchestration-api + orchestration-ui) is separately versioned and added explicitly in `pnpm-workspace.yaml`.

## API client generation

yucca-api DTOs → `mise yucca-api:sync-openapi` → `mise yucca-api-client:build` (oazapfts) → `packages/yucca-api-client/src/fetch-client.ts`. The client is generated: regenerate it on contract changes, never hand-edit it.

## Database

PostgreSQL via **Kysely**. Schema in `packages/yucca-api/src/schema/` (`tables/`, `migrations/`); yucca-api is the schema owner, other services read the same DB.

## Go services

`michael` and `yuctl` are Go 1.25, `internal/<pkg>`, aws-sdk-go-v2, zerolog. `yuctl` (cobra) is the ops CLI: it reads the Terraform **discovery** contract from S3 state to resolve topology and drive day-2 ops. See [yuctl](/operations/yuctl).
