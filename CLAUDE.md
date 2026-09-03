# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## ⚠️ CRITICAL — LIFE OR DEATH: zero code comments

**This is the most important rule in this file. Violating it is treated as a failed task.**
Never write a comment that narrates, restates, or explains what the code already says — no
"fetch the user", no "call the service", no explaining your change to the reviewer. Make the
code self-explanatory instead: better names, smaller functions.

```ts
// BAD — restates the code. Never do this:
// fetch the user's repositories
const repos = await this.repositoryService.list(userId);

// GOOD — no comment; the code already says it:
const repos = await this.repositoryService.list(userId);
```

The only permitted comment captures something the code *cannot* express — a why, a constraint,
a gotcha a reader would otherwise miss. These are rare. When in doubt, do not comment.
**Before finishing any edit, re-read your diff and delete every comment that fails this bar.**

This rule is about code. Infra config (`tf/`, `ansible/`, `kubernetes/`) has no equivalent
remedy: the keys belong to Ceph, Terraform and Ansible, so there is no better name to pick and
no smaller function to extract. The bar is the same and restating a value is still banned, but
a comment recording why a value deviates from its default, or what breaks when it changes, is
usually the only place that knowledge can live.

## What this is

Yucca is a multi-tenant **backup service**: OIDC-authenticated users get S3-backed
[restic](https://restic.net/) repositories. Two things at once:

- **Application** (`packages/`) — NestJS/Go/Svelte services.
- **Infrastructure** (`tf/`, `ansible/`, `kubernetes/`, `charts/`) — Ceph object storage,
  Talos K8s, Flux GitOps, networking. See `README.md` and per-directory `README.md` files.

## Tooling

- Everything runs through **[mise](https://mise.jdx.dev/)** tasks (`.mise/tasks/` scripts +
  `.mise/config.toml` aggregates). mise pins every binary (node, pnpm, go, kubectl, helm, tilt,
  opentofu, ansible…) — do not assume a tool is on PATH outside of mise.
- **pnpm workspaces** with a **catalog** (`pnpm-workspace.yaml`): add/bump shared deps in the
  catalog, referenced as `"catalog:"` in each `package.json` — not in individual packages.
- Secrets come from **1Password** via `op run`; `.env` files contain `op://` refs, never
  literal secrets. `OP_ACCOUNT` is set in `.env` (copy `.env.example`).

## Common commands

```bash
mise dev                  # compose-based dev: deps, docker infra (postgres/minio/mock-oidc/victoria-*), all *:dev
mise <pkg>:dev            # one service, e.g. mise web:dev, mise yucca-api:dev

mise check                # lint + format check + svelte-check + unit tests (= the `checks` CI job)
mise fix                  # autofix lint/format + lingui extract
mise build                # build all packages

mise test                 # all unit tests (jest per NestJS pkg, vitest for web)
mise test:integration     # integration tests (--jobs 1; needs infra up)
mise test:integration:k3d # CI split: the database-backed suites; :s3 = the Ceph-backed ones
mise test:e2e             # e2e (needs the stack running); mise test:e2e:web = Playwright
mise <pkg>:test           # one package; args after -- go to jest: mise yucca-api:test -- -t "name"

mise yucca-api:migrations <args>   # DB migrations (@immich/sql-tools; yucca-api owns the schema)
```

### k3d + Tilt (prod-shaped dev)

`mise k3d:up` → `mise tilt:up` (build images, render charts from `kubernetes/apps/dev/local`,
port-forward, live_update); `tilt:down` / `k3d:down` to tear down. Tilt's source of truth is the
Flux tree under `kubernetes/` — see the extensively commented `Tiltfile`.

CI deploys resource subsets rather than the whole stack (`mise tilt:ci` still does everything):
`tilt:ci-infra` (integration — postgres, mock-oidc, victoria; **no Ceph**), then for e2e
`tilt:ci-ceph` (Rook only; builds no images, so it converges while the workspace installs)
followed by `tilt:ci-e2e` (the apps the e2e suites touch). Ceph converging outweighed every test
in the integration job, so that job dropped it and its S3-backed suites moved to the e2e one.

Ports: `5173` web · `3020` yucca-api · `3030` yucca-admin-api · `3010` michael ·
`8092` mock-oidc · `8025` mailpit · `8093` mock-postmark · `9000` ceph rgw · `8428` victoria-metrics · `9428` victoria-logs.

### Infrastructure commands

```bash
mise tf:plan / tf:init / tf:fmt    # terragrunt (TF_STACK_DIR=tf/deployment/<partition>/<region>/<stack>)
mise k8s:validate                  # helm template + kubeconform + flux-local of the k8s tree (no cluster)
mise mgmt:render-inventory / mgmt:ansible
```

**CI owns terraform applies** (`.github/workflows/infra.yml` on merge to main). Locally you may
`tf:plan` but never `tf:apply`. Gotcha: unset the shell's stray `AWS_CA_BUNDLE` before planning —
it breaks the OVH S3 state backend. We own the `futo-org/netbird` provider
(`../terraform-provider-netbird`, pin ≥ 1.0.2); renaming a NetBird setup key forces replacement
(the API can't rename keys), regenerating its value.

## Application architecture

Backend services are **NestJS 11 + TypeScript**: controllers → services → repositories,
Zod-validated `env.ts`, JWT auth guards via `@AuthRoute()`, OTel from `@common/server`
(imported at bootstrap; pino logs, OTLP to victoria-*).

| Service | Lang | Role |
|---|---|---|
| `yucca-api` | NestJS | User-facing API. Owns auth (OIDC code + device flow, ES256 JWTs), repositories, **DB schema + migrations**. |
| `yucca-admin-api` | NestJS | Admin API (user/session/repository management). Same DB + JWT validation. |
| `michael` | Go | **Production** restic REST backend — S3 proxy with JWT verification, WORM enforcement, backend pooling. |
| `columbo` | Go | Ticket investigation agent: LLM loop (OpenRouter) over per-user-scoped o11y queries, answers only into staff threads. See `docs/columbo.md`. |
| `monk` | Go | Ceph scrub-backlog exporter: polls `pg ls`, serves measured per-pool scrub-age metrics on :9284. Deployed onto mon hosts by ansible, not K8s. |
| `restic-api` | NestJS | Earlier TS implementation of the restic backend, kept as **reference**; not deployed. |
| `yucca-metrics-worker` | NestJS | 5-min cron: RadosGW usage → meter tables → per-connection rollup (`connectionMetrics`, billing floor), OTel gauges. |
| `mock-oidc-provider` | Node | Dev/test OIDC IdP (code + device flow). |
| `mock-postmark-provider` | Node | Dev/test Postmark API mock; delivers into the Mailpit inbox. |
| `common` (`@common/server`) | TS lib | OTel init, pino repository, **feature-flag registry + connection-type registry**, Postmark `EmailRepository` (`@common/server/email`). |
| `emails` (`@common/emails`) | Svelte lib | Transactional email templates (better-svelte-email, web theme), prebuilt to JS for the NestJS apps. See `docs/email.md`. |

**Frontend** (`packages/web`): SvelteKit 5 + Tailwind 4, `@immich/ui`, lingui i18n
(`mise web:lingui:*`; compiled locales are generated, not edited), generated API client.
**`packages/yucca-sdk/`** (orchestration-api + orchestration-ui) is separately versioned and
added explicitly in `pnpm-workspace.yaml`.

**API client generation**: yucca-api DTOs → `mise yucca-api:sync-openapi` →
`mise yucca-api-client:build` (oazapfts) → `packages/yucca-api-client/src/fetch-client.ts`.
Generated — regenerate on contract changes, never hand-edit.

**Database**: PostgreSQL via **Kysely**. Schema in `packages/yucca-api/src/schema/`
(`tables/`, `migrations/`); yucca-api is the schema owner, other services read the same DB.

**Go services**: `michael` and `yuctl` are Go 1.25, `internal/<pkg>`, aws-sdk-go-v2, zerolog.
`yuctl` (cobra) is the ops CLI: reads the Terraform **discovery** contract from S3 state to
resolve topology and drive day-2 ops. See `packages/yuctl/README.md`.

### Connections, feature flags, token revocation

Full detail: `docs/connections.md`. The essentials:

- **Connections**: a user has N connection instances of type `immich`/`restic`; every repository
  has a NOT NULL `connectionId`. Device flow binds via `?connection_type=&connection_name=`;
  instance attribution is client-driven (`POST /connections/:id/adopt`), never guessed
  server-side. The `/connections` surface is open to every authenticated user.
- **Feature flags**: registry in code (`@common/server` `FeatureFlags`) + strict-boolean per-user
  overrides; resolution `override ?? registry default`. Flags gate non-default connection *types*
  (`connection-restic`); admin-provisioned connections bypass. Boundary rule:
  env/cluster-settings = deployment config (ops-owned); feature flags = per-user product gating
  (admin-owned, runtime).
- **Billing**: `ConnectionTypeInfos` declares metering tiers and `minObjectSizeBytes` floor;
  metrics-worker computes `billableBytes = max(size, objects * floor)` per connection.
- **Revocation** — **not on main yet**: the layered design in `docs/connections.md` (valkey
  verdict cache, yucca-api introspection, yuctl `tokens`) is in flight on
  `feat/conn-4-revocation`; no valkey/redis service, introspection endpoint, or `resticTokens`
  table exists in the current tree.

## Infrastructure architecture

Fleet model: **partition → region → { one K8s cluster, one-or-more Ceph clusters }**.
Partitions `prod`/`staging`/`dev`; regions e.g. `htz-fsn1`, `austin`, `local`, plus `global`.
Slug = `<partition>-<region>`.

- **`tf/`** — OpenTofu + Terragrunt (`deployment/<partition>/<region>/<stack>/`, shared logic in
  `shared/modules/`). Every stack emits a non-sensitive **`discovery` output** consumed by
  yuctl/k8s/ansible; secrets in it are `op://` refs.
- **`ansible/`** — `ceph/` (cephadm bare-metal), `talos/` (Talos VMs on the Ceph hypervisors —
  VM provisioning only; talosctl is owned by the TF siderolabs provider), `mgmt/` (management
  hosts + NetBird). Roles gated by `*_enabled` flags.
- **`kubernetes/`** — **Flux GitOps**. `clusters/<partition>/<region>/` entry points;
  `apps/{base,<overlays>,dev/local}/` HelmReleases; `components/` Kustomize Components per role.
  Config layers merged via postBuild: `cluster-settings.generated.yaml` (TF), `cluster-settings.yaml`
  (human), `image-versions` (CI).
- **`charts/`** — in-repo Helm charts; `lib/yucca-common` library chart + `apps/<svc>` charts.
  Service names pinned via `fullnameOverride` so DNS is identical under Tilt and Flux.

Deploy flow: merge to main → CI builds `0.0.<run_number>` images → Flux auto-promotes to
staging → prod is promoted by merging the release-please PR (stamps both prod pins under
`kubernetes/clusters/prod/htz-fsn1/`).

## Conventions

- **Conventional commits** enforced on PRs (`feat(scope):`, `fix(scope):`, `chore:`); scopes
  like `ceph`, `netbird`, `michael`, `yucca-api`, `ansible`, `bgp`. Releases via release-please;
  the monorepo is single-versioned.
- **PR descriptions and commit messages: one line at most.** Always. The diff carries the
  detail; neither the PR body nor the commit message restates it.
- ESLint is strict on promises (`no-floating-promises`, `no-misused-promises`, `require-await`,
  `await-thenable` are errors). Prettier: single quotes, trailing commas, width 120.
- Generated files are eslint-ignored: `**/fetch-client.ts`, `packages/web/src/locales`, `dist`,
  `build`, `.svelte-kit`.
- **Match the package you are in.** Read the surrounding code first; write code that looks like
  what is already there, not your own conventions. (And remember the life-or-death rule at the
  top: zero comments.)

### Naming

- **Clusters are themed by workload**: Kubernetes → Star Wars (`luke` = staging, `father` =
  soon-to-be prod); Ceph → Dune (`sietch`, `spice`, …).
- **Node hostnames**: `<product>-<provider>-<region>-<clustername>-<role>-<nodename>`, e.g.
  `yucca-int-aus-luke-k8s-<word>`. Provider/region are the 3-letter codes from the region's
  `region.hcl` (austin = `int`/`aus`, htz-fsn1 = `htz`/`fsn`); role is `k8s` or `ceph`;
  `<nodename>` auto-picks from `tf/shared/modules/node-names/wordlist.txt` (deterministic per
  cluster; pass an explicit `name` to override).
