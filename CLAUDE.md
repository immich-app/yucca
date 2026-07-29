# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yucca is a multi-tenant **backup service**: OIDC-authenticated users get S3-backed
[restic](https://restic.net/) repositories. The repo is two things at once:

- **Application** (`packages/`) — the NestJS/Go/Svelte services that run the product.
- **Infrastructure** (`tf/`, `ansible/`, `kubernetes/`, `charts/`) — everything that
  operates Yucca: Ceph object storage, Talos K8s, Flux GitOps, networking. See the
  table in `README.md` and the per-directory `README.md` files; each infra subtree is
  largely self-contained.

## Tooling model

Everything is driven through **[mise](https://mise.jdx.dev/)** tasks, not raw `pnpm`/`go`.
Task definitions live in `.mise/tasks/` (shell scripts, hierarchical: `web/test/_default`
is `mise run web:test`) and `.mise/config.toml` (the `[tasks.*]` aggregate tasks + tool
pins). `mise` also pins every binary version (node, pnpm, go, kubectl, helm, tilt, opentofu,
ansible, etc.) — do not assume a tool is on PATH outside of mise.

Package manager is **pnpm workspaces** with a **catalog** (`pnpm-workspace.yaml`): dependency
versions are centralized there and referenced as `"catalog:"` in each `package.json`. Add/bump
shared deps in the catalog, not in individual packages.

Secrets come from **1Password** via `op run`. Tasks that need secrets wrap commands in
`op run --env-file=... --`; `.env` files contain `op://` references, never literal secrets.
`OP_ACCOUNT` is set in `.env` (copy `.env.example`).

## Common commands

```bash
# Compose-based dev (fastest inner loop): postgres, minio, mock-oidc, victoria-* in Docker
mise dev                  # install deps, build common, start docker infra, run all *:dev
mise <pkg>:dev            # run one service, e.g. mise web:dev, mise yucca-api:dev

# Quality gates (what CI runs)
mise check                # lint + format check + svelte-check + unit tests (= the `checks` CI job)
mise fix                  # autofix lint/format + lingui extract
mise lint / mise format   # individually
mise build                # build all packages

# Tests
mise test                 # all unit tests (jest per NestJS pkg, vitest for web)
mise test:integration     # all integration tests (runs --jobs 1; needs infra up)
mise test:e2e             # e2e (jest suites) — needs the stack running
mise test:e2e:web         # web Playwright e2e
mise <pkg>:test           # one package's unit tests, e.g. mise yucca-api:test
mise yucca-api:test -- -t "name of test"   # single test (args after -- go to jest)
mise yucca-api:test:watch # watch mode

# Database migrations (yucca-api owns the schema)
mise yucca-api:migrations <args>   # wraps @immich/sql-tools against the dev DB
```

### k3d + Tilt (prod-shaped dev)

The alternative dev flow that mirrors prod topology (Helm, CloudNativePG, Rook-Ceph, in-cluster DNS):

```bash
mise k3d:up      # create local k3d cluster + registry
mise tilt:up     # build images, render charts from kubernetes/apps/dev/local, port-forward, live_update
mise tilt:down
mise k3d:down
```

CI uses the same path: `mise tilt:ci-infra` (infra only, apps run on the runner) for integration
tests, `mise tilt:ci` (full stack) for e2e. See `Tiltfile` (extensively commented) — Tilt's source
of truth is the Flux tree under `kubernetes/`, not a separate manifest.

Forwarded ports: `5173` web · `3020` yucca-api · `3030` yucca-admin-api · `3010` michael ·
`8092` mock-oidc · `9000` ceph rgw (S3) · `8428` victoria-metrics · `9428` victoria-logs.

### Infrastructure (terragrunt / ansible)

```bash
mise tf:plan / tf:apply / tf:init / tf:destroy   # terragrunt for a stack (TF_STACK_DIR=tf/deployment/<partition>/<region>/<stack>)
mise tf:fmt
mise k8s:validate        # helm template + kubeconform + flux-local build of the whole k8s tree (CI gate, no cluster)
mise mgmt:render-inventory / mgmt:ansible        # render + converge management hosts
```

`tf:*` wrap terragrunt in `tf/op-run.sh` (injects the 1P superuser token from `tf/.env`).

> **CI owns terraform applies.** Do **not** run `mise tf:apply` (or `infra:apply`) by
> hand — `terraform`/`terragrunt` applies are run by CI (`.github/workflows/infra.yml`)
> on merge to main. Locally you may `tf:plan` to preview, but never apply. (Also: the
> `tf:*` tasks inherit a stray `AWS_CA_BUNDLE=~/.config/homelab/root-ca.crt` from the
> shell that breaks the OVH S3 state backend — unset it if you plan locally.)
>
> **NetBird futo-org provider — `netbird_group` resources bug (fixed in 1.0.2):**
> `registry.terraform.io/futo-org/netbird` **≤ 1.0.1** could not UPDATE/DELETE a
> `netbird_group` that had network resources tagged into it — the TF→API path decoded
> the `resources` list of `{id,type}` objects into `[]map[string]string` ("cannot
> reflect tftypes.Object … into a map"), so a resource-tag group (e.g. htz-fsn1
> `resources`) couldn't be renamed in place. **Fixed in 1.0.2** — we own the provider
> (`../terraform-provider-netbird`); stacks pin `version = "1.0.2"`. Renaming a setup
> key still **forces replacement** (the NetBird API can't rename keys), regenerating
> its value.

## Application architecture

**Backend services are NestJS 11 + TypeScript**, sharing patterns: controllers → services →
repositories (data access), Zod-validated `env.ts`, JWT auth guards via an `@AuthRoute()`
decorator, and observability from the shared `@common/server` package. Each service imports
`@common/server/otel` at bootstrap to init the OpenTelemetry SDK (pino logs, OTLP traces/metrics
to victoria-*).

| Service | Lang | Role |
|---|---|---|
| `yucca-api` | NestJS | User-facing API. Owns auth (OIDC code + device flow, ES256 JWTs), repositories, **the database schema + migrations**. |
| `yucca-admin-api` | NestJS | Admin API (user/session/repository management). Shares the same DB + JWT validation. |
| `michael` | Go | **Production** restic REST backend — S3 proxy implementing restic's HTTP protocol, with JWT (ECDSA pubkey) verification, WORM enforcement, multi-backend pool/DNS load-balancing. Deployed in k8s (`kubernetes/apps/base/michael`). |
| `restic-api` | NestJS | Earlier TypeScript implementation of the same restic backend, kept as a **reference** (`mise restic-api:dev-reference`); not in the deployed app set. |
| `yucca-metrics-worker` | NestJS | Cron worker (every 5 min): reads bucket usage from RadosGW, writes meter tables, **rolls usage up per connection into `connectionMetrics` (with the per-type billing floor)**, emits OTel gauges; **also re-asserts restic-token validity markers into Redis** so they survive a Redis restart. |
| `redis` (valkey) | — | Ephemeral restic-token **validity marker** store michael checks per request (present = valid, absent = revoked). In-repo chart `charts/apps/redis`; primary-region only (secondaries have no marker-population path and run with validity checking off). |
| `mock-oidc-provider` | Node | Dev/test OIDC IdP (code + device flow). Used by compose and k3d when no real issuer is configured. |
| `common` (`@common/server`) | TS lib | Shared OTel init, pino logger repository, logging interceptor, **the feature-flag registry (`FeatureFlags`) and connection types (`ConnectionTypes`)**. |

**Frontend** (`packages/web`) is **SvelteKit 5 + Tailwind 4**, using `@immich/ui`, lingui i18n
(`mise web:lingui:*` to extract/compile — compiled locales are generated, not edited), and the
generated API client. It also embeds the orchestration UI (`@futo-org/backups-orchestrator-ui`).

**`packages/yucca-sdk/`** is a separately-versioned product: `orchestration-api` (NestJS) +
`orchestration-ui` (SvelteKit). Not in the pnpm workspace glob's `packages/*` alone — note
`packages/yucca-sdk/*` is added explicitly in `pnpm-workspace.yaml`.

### API client generation (don't hand-edit generated files)

`yucca-api` controllers/DTOs (via `@nestjs/swagger`) → `mise yucca-api:sync-openapi` writes
`openapi-specs.json` → `mise yucca-api-client:build` runs `oazapfts` to generate
`packages/yucca-api-client/src/fetch-client.ts` (published as `@futo-org/backups-api-client`,
consumed by web). `fetch-client.ts` is generated (eslint-ignored). When you change an API
contract, regenerate rather than editing the client.

### Connections, feature flags, and restic-token revocation

- **Connections** (`connections` table) make "what backs up this account" first-class: a user has N
  connection instances of type `immich` or `restic`. Every repository has a `connectionId`
  (NOT NULL); device-flow sessions bind to a connection via `?connection_type=&connection_name=` on
  `/auth/oidc/device`. Existing repos were backfilled onto a default `immich` connection; instance
  attribution is client-driven via `POST /connections/:id/adopt` (moves default-connection repos to a
  named instance), never guessed server-side. The in-repo orchestrator (`yucca-sdk`) does this on
  device-flow login: it registers as an `immich` connection named after its external host, then
  best-effort adopts its existing repositories onto that instance. The `/connections` API surface
  (list, create, adopt, manage — including multiple `immich` instances) is open to **every**
  authenticated user.
- **Feature flags** = registry in code (`@common/server` `FeatureFlags`), strict-boolean per-user
  overrides in `userFeatureFlagOverride`. Resolution is `override ?? registry default`; the default
  flips at GA via a release (code-only defaults). Flags gate self-service use of the individual
  non-default connection *type*, not the whole surface: `connection-restic`
  (`experimental`, default off) — `immich` needs none. The mapping lives in `@common/server`
  `ConnectionTypeFlags`/`connectionTypeFlag()`, checked in `ConnectionService.create` and the device
  flow; admin-provisioned connections bypass it (admin authority). `@RequireFeature` remains as the
  generic route-level guard for future whole-route gating. Manage from yuctl: `users features
  set/clear`, `features enable-batch`. **Boundary rule:** env/cluster-settings = deployment config
  (ops-owned, per-partition); feature flags = per-user product gating (admin-owned, runtime).
- **Per-type descriptor + billing** live in the code registry (`@common/server` `ConnectionTypeInfos`):
  each type declares its metering tiers, `reportsActivity`, `minObjectSizeBytes` (billing floor), and
  `revocable`. Billing keys off the always-available **storage** tier: `yucca-metrics-worker` rolls each
  connection's per-repo RadosGW readings up into `connectionMetrics` and computes
  `billableBytes(type, size, objects) = max(size, objects * minObjectSizeBytes)` (immich floor 0; non-immich
  1 MiB — an aggregate approximation, RadosGW gives no per-object histogram). `GET /connections` returns the
  rollup. **Self-serve restic** (flagged): `POST /connections/restic` creates connection+repo+long-lived URL
  in one shot; `POST /repository/:id/restic` mints for an existing repo — **long-lived is revocable-only**
  (restic: default `RESTIC_JWT_EXPIRES_IN` 90d, `expiresIn` capped by `RESTIC_JWT_MAX_EXPIRES_IN` 365d;
  immich: short `JWT_EXPIRES_IN` lifetime, custom `expiresIn` rejected — michael never validity-checks
  non-revocable types, so they must not be long-lived); `GET /repository/:id/restic-tokens` +
  `DELETE /restic-tokens/:jti` are owner-scoped. See `docs/connections.md`.
- **Restic-token revocation** = **cached validity, bounded grace** (not a fail-open denylist). Redis holds a
  positive marker `yucca:restic:valid:<jti>` per live token; michael treats present = valid, **absent =
  revoked/unknown → denied**. Mint writes the marker (revocable types only — michael **skips** non-revocable
  types like immich via `REVOCABLE_CONNECTION_TYPES`, so an absent marker never wrongly denies them); revoke
  deletes it (takes effect within michael's fresh cache `REVOCATION_FRESH_TTL_MS`, default 60s). On a Redis
  outage michael honors a previously-valid jti until `REVOCATION_GRACE_MS` (default 5min) then fails **closed**.
  `yucca-metrics-worker` re-asserts valid markers from the DB every 5min (Redis stays ephemeral). Enforced only
  where `REDIS_ADDR` is set (primary regions). yuctl: `tokens list/revoke`, `repos url --ttl`.

### Database

PostgreSQL accessed via **Kysely**. The schema lives in `packages/yucca-api/src/schema/`
(`tables/` definitions, `migrations/` SQL run through `@immich/sql-tools`). `yucca-api` is the
schema owner; other services read the same DB.

### Go services

`michael` and `yuctl` are Go 1.25, `module <name>` + `internal/<pkg>`, `aws-sdk-go-v2` for S3,
`rs/zerolog` for logs. `yuctl` (`packages/yuctl`, cobra CLI) is the operations CLI: it reads the
Terraform **discovery** contract from S3 state (no terragrunt/checkout) to resolve the
partition→region→{k8s, ceph} topology and drive day-2 ops. See `packages/yuctl/README.md`.

## Infrastructure architecture

The whole fleet is modeled as **partition → region → { exactly one K8s cluster, one-or-more
Ceph clusters }** (introduced in #222; replaced the older env/site terms). Partitions: `prod`,
`staging`, `dev`. Regions e.g. `htz-fsn1`, `austin`, `local`, plus a `global` pseudo-region for
account-wide stacks. Slug = `<partition>-<region>`.

- **`tf/`** — OpenTofu + Terragrunt, authoritative for cluster identity, 1P secret items, and
  rendered Ansible inventories. Layout: `deployment/<partition>/<region>/<stack>/`; shared logic
  in `shared/modules/` (ceph-cluster, talos-baremetal, identity, fabric-addressing,
  netbird-env, fabric/switch config). Every stack emits a non-sensitive **`discovery` output**
  (the contract `yuctl`/k8s/ansible consume); all secrets in it are `op://` refs. `render/` renders
  Ansible inventories.
- **`ansible/`** — three subtrees: `ceph/` (cephadm bare-metal clusters), `talos/` (Talos K8s as
  libvirt VMs on the Ceph hypervisors — VM provisioning only; talosctl gen/bootstrap is owned by
  the TF siderolabs provider), `mgmt/` (Hetzner management hosts + NetBird routing). Roles are
  gated by `*_enabled` flags.
- **`kubernetes/`** — **Flux GitOps**. `clusters/<partition>/<region>/` are entry points;
  `apps/{base,<overlays>,dev/local}/` hold HelmReleases; `components/{infra,apps,roles}/` are
  Kustomize Components selected per role (primary/secondary). Three config layers merged via
  postBuild: `cluster-settings.generated.yaml` (TF-rendered), `cluster-settings.yaml` (human),
  `image-versions` (CI). Tilt reads `apps/dev/local/`.
- **`charts/`** — in-repo Helm charts. `lib/yucca-common` is a library chart (shared deployment/
  service/secret templates); `apps/<svc>` are per-service charts depending on it; `platform/` for
  rook/cnpg/objectuser. Service names are pinned via `fullnameOverride` so in-cluster DNS is
  identical whether Tilt or Flux renders them.

Deploy flow on merge to main: CI builds images tagged `0.0.<run_number>` → Flux auto-promotes the
highest tag to staging → production is promoted by merging the release-please PR, which stamps the
release tag into both prod pins (`kubernetes/clusters/prod/htz-fsn1/{flux-release,image-versions}.yaml`).

## Conventions

- **Conventional commits** are enforced on PRs (`feat(scope):`, `fix(scope):`, `chore:`).
  Common scopes: `ceph`, `netbird`, `michael`, `yucca-api`, `ansible`, `bgp`. Releases are
  automated via release-please (`chore(main): release …` PRs); the monorepo is single-versioned.
- ESLint flat config (`eslint.config.mjs`) is strict on promises: `no-floating-promises`,
  `no-misused-promises`, `require-await`, `await-thenable` are all errors. Prettier: single quotes,
  trailing commas, width 120.
- Generated files are eslint-ignored: `**/fetch-client.ts`, `packages/web/src/locales`, `dist`,
  `build`, `.svelte-kit`.

### Naming

- **Cluster names are themed by workload.** Kubernetes clusters → **Star Wars** (`luke` =
  staging, `father` = the soon-to-be prod). Ceph clusters → **Dune** (`sietch`, `spice`, …).
  Choose the next themed name when standing up a cluster; it's the Talos/Ceph cluster name +
  the `<clustername>` hostname segment.
- **Node hostnames** follow `<product>-<provider>-<region>-<clustername>-<role>-<nodename>` —
  e.g. a staging Talos node is `yucca-int-aus-luke-k8s-<word>`:
  - `product` = `yucca`; `role` = the workload segment (`k8s` for Talos nodes, `ceph` for Ceph).
  - `provider` / `region` = the **3-letter** `provider_code` / `region_code` from the region's
    `region.hcl` (austin = `int`/`aus`, htz-fsn1 = `htz`/`fsn`).
  - `<clustername>` = the themed cluster name (above).
  - `<nodename>` = auto-picked from the shared name inventory
    (`tf/shared/modules/node-names/wordlist.txt`) — deterministic per cluster, unique within it;
    pass an explicit node `name` to override.
