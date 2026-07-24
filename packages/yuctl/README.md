# yuctl

`yuctl` is the yucca operations CLI. It resolves the **partition → region →
{one K8s cluster, one-or-more Ceph clusters}** topology directly from Terraform
**discovery outputs** (read out of S3 state — no `terragrunt` invocation, no
checkout, no provider init required) and drives day-2 operations on top of it.

It is the consumer side of the discovery contract defined in Workstream 1.5 of
the partition/region rework (`tf/deployment/<partition>/<region>/<stack>` stacks
each emit a non-sensitive `discovery` output; secrets are always `op://`
references, never values).

## Conventions

Built to match `packages/michael`: `module yuctl`, Go 1.25, `main.go` +
`internal/<pkg>`, `aws-sdk-go-v2` for S3, `rs/zerolog` for logging. The one
documented divergence is **`spf13/cobra`** for the nested subcommand tree
(michael is a single-purpose HTTP server and stays stdlib-only; yuctl is a
multi-verb CLI). There is no Dockerfile — yuctl is an operator CLI, not a
deployed service.

## Build

```sh
mise run yuctl:build        # → dist/yuctl
mise run yuctl:dev -- <args>  # go run . <args>
```

Or directly: `cd packages/yuctl && go build -o ../../dist/yuctl .`

## Package layout

```
packages/yuctl/
  main.go                     # entrypoint → cli.NewRootCmd().ExecuteContext
  internal/
    cli/                      # cobra command tree (root, select, ceph, infra, users)
    discovery/                # S3 state reader + stack enumeration + topology queries
    state/                    # discovery output contract structs + tfstate parsing
    op/                       # `op read` / ReadToTempFile (0600) wrapper
    context/                  # ~/.config/yuctl/context.json {partition,region,ceph_cluster}
    k8s/                      # talosctl upgrade wrapper
    ceph/                     # RGW/dashboard health probe
    adminapi/                 # CLI loopback login + Bearer admin-api client
```

## Command tree

```
yuctl
├── select <partition>@<region>     validate vs discovery → write context (clears ceph)
├── login                           browser loopback login → cached admin-api session JWT
├── ceph
│   ├── select <name>               validate vs region's ceph_clusters keys → nest in context
│   └── get
│       └── health                  probe ceph_clusters[name] RGW/dashboard health
├── infra
│   └── talos
│       └── upgrade                 talosctl upgrade CP nodes (--dry-run, confirm/--yes, --image)
├── users
│   └── list                        list users in the partition's PRIMARY region
└── tools
    └── bench                       restic e2e benchmark against michael, run from a mgmt host
        ├── compare <a> <b>         render before/after deltas from two results files
        └── cleanup                 forget+prune every bench snapshot (timed)
```

Global flags: `--log-level` (trace|debug|info|warn|error), `--log-format`
(pretty|json).

## State-reading approach

1. **Enumerate stacks** — auto-detected, preferring offline data:
   - **local tree** (preferred): walk up from `$PWD` for a `tf/deployment`
     directory and find every `terragrunt.hcl` at depth ≥ 2
     (`<partition>/<region>/<stack…>`). Override with
     `YUCTL_TF_DEPLOYMENT_DIR`.
   - **bucket fallback**: `ListObjectsV2` on `yucca-tf-state` under prefix
     `yucca/`, keeping `*/terraform.tfstate` keys.
2. **Resolve live values** — `GetObject` each `terraform.tfstate` and parse
   `.outputs.discovery.value` into `internal/state.Discovery`. Stacks with no
   `discovery` output (pre-contract) or no applied state are skipped, not fatal.
3. **Query** the merged `Topology` (`HasRegion`, `Kubernetes`, `CephClusters`,
   `PrimaryRegion`, `RegionMeta`).

The S3 client mirrors the terragrunt backend exactly: endpoint
`https://s3.eu-west-par.io.cloud.ovh.net/`, region `eu-west-par`, path-style.
Credentials come from `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` when already
set (e.g. under `op run`), otherwise they are resolved from 1Password —
defaulting to the same items as `tf/.env`
(`op://yucca_tf/TF_STATE_S3_ACCESS_KEY/password` and `…_SECRET_KEY`), overridable
via `YUCTL_TF_STATE_ACCESS_KEY_REF` / `YUCTL_TF_STATE_SECRET_KEY_REF`.

## Secrets

All secret material in the discovery contract is an `op://` reference. yuctl
resolves them on demand by shelling to the 1Password CLI (`op read`), matching
the repo-wide `op run` convention and interactive desktop-unlock UX. kube/talos
configs are written to 0600 temp files (`op.ReadToTempFile`) and removed after
use. Override the binary with `OP_BIN`.

## Context

`yuctl select staging@austin` validates the target against discovery and writes
`${XDG_CONFIG_HOME:-~/.config}/yuctl/context.json`
(`{partition, region, ceph_cluster}`), clearing any selected ceph cluster.
`yuctl ceph select sietch` validates against that region's `ceph_clusters` keys
and nests the selection. Subsequent commands operate on the stored context.

### First vertical slice

```sh
yuctl select staging@austin
yuctl ceph select sietch
yuctl ceph get health         # → Ceph health against staging end-to-end
```

## `login` / `users list` — admin-api auth

`yuctl login` authenticates against the selected partition's admin-api using
the **CLI loopback login flow** — no IdP client secret ever reaches the
operator machine:

1. Resolve the partition's **primary** region (`discovery.role == "primary"`)
   and derive the admin-api base URL from its k8s `api_endpoint`
   (`kube.<cluster>.<region>.<provider>.yucca.futo.network` →
   `https://admin.<…>` — the same overlay host as `YUCCA_ADMIN_HOST`); override
   with `--admin-url` or `YUCTL_ADMIN_API_URL`. The host is on the NetBird
   overlay, so the operator (and their browser) must be connected.
2. Start a listener on `127.0.0.1:<random port>` and open the browser at
   `GET /api/auth/cli/login?port&state&code_challenge` (S256 challenge; the
   verifier never leaves yuctl). `--no-browser` prints the URL instead.
3. The admin-api — which owns the confidential OIDC client — runs its normal
   browser OIDC dance, then redirects to the loopback listener with a
   **one-time code**.
4. yuctl exchanges code + verifier at `POST /api/auth/cli/token` for an
   admin-api-minted **24h ES256 session JWT**, cached at 0600
   (`admin-token-<partition>.json`); `--reauth` forces a fresh login. The JWT
   is sent as `Authorization: Bearer` and verified locally by the admin-api
   (`packages/yucca-admin-api/src/services/auth.service.ts`).

`users list` reuses the cached session (running the same login flow when it is
missing or expired) and calls `GET /api/user` (cursor-paginated via
`nextCursor`, `--limit` page size).

## `tools bench` — michael end-to-end benchmark

Benchmarks the restic gateway with real restic traffic from a **management
host** of the selected region (the real client path to the `gw` VIP), built
for before/after comparisons of michael changes.

```bash
yuctl select prod@htz-fsn1
yuctl tools bench --size 64GiB --connections 5,16,32,64 --label before-sweep
yuctl tools bench --size 1TiB --connections 64 --incrementals 3 --label before
# ...deploy the new michael, rerun with --label after...
yuctl tools bench compare bench-before-*.json bench-after-*.json
```

How it works:

- The orchestrator pushes an embedded linux/amd64 **bench agent** (built and
  `go:embed`ded by `mise yuctl:build`; `--agent-bin` overrides) plus a
  **pinned restic release** (downloaded once, checksum-verified — identical
  client on every run) to the mgmt host over ssh, streams progress events
  back, and writes a results JSON locally.
- The **target host** comes from discovery (`fabric.mgmt_hosts`, first entry);
  `--host` overrides. Regions without a fabric stack (austin) need `--host`.
  `--from-here` skips ssh entirely and runs the agent **in-process on this
  machine** (a platform-matched pinned restic is fetched) — for running yuctl
  directly on a mgmt host, or ad-hoc runs from anywhere. With an explicit
  `--repo` it needs neither a selected context nor state credentials.
- The **repository** is created via admin-api (`yuctl login` session):
  `POST /repository` + `POST /repository/:id/url` mint a fresh
  `yucca-bench-<label>-<ts>` repo and a restic URL signed with yucca-api's
  key. `--repo`/`RESTIC_REPOSITORY` skips provisioning (BYO);
  `--repo-id` re-mints a URL for an existing repo. Bench repos persist after
  the run (admin-api repository deletion is unimplemented — needs S3-side
  removal); `cleanup` prunes them to ~empty.
- Phases per `--connections` cell: `generate` (seeded incompressible data) →
  `backup` → N×(`mutate` + `incremental`) → `check` (the pack-listing path) →
  wipe → `restore`. Each cell reseeds its dataset so dedup can't fake upload
  numbers; the agent preflights free disk in `--workdir`.
- Credentials (repo URL with embedded JWT, password) travel over the ssh
  session's stdin — never argv — and are scrubbed from results files.

The ssh session stays open for the whole run (keepalives set); run multi-hour
benchmarks inside tmux. Pair the client numbers with the michael dashboard
(TTFB, connection churn, S3 client metrics) for the server-side view.

## Environment variables

| Variable                                             | Purpose                                | Default                                                  |
| ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`        | state-bucket creds (skip op)           | resolved via op                                          |
| `YUCTL_TF_STATE_ACCESS_KEY_REF` / `…_SECRET_KEY_REF` | op refs for state creds                | `op://yucca_tf/TF_STATE_S3_{ACCESS,SECRET}_KEY/password` |
| `YUCTL_TF_DEPLOYMENT_DIR`                            | force the local stack-enumeration dir  | walk up for `tf/deployment`                              |
| `OP_BIN`                                             | 1Password CLI binary                   | `op`                                                     |
| `YUCTL_ADMIN_API_URL`                                | admin-api base URL (`login`, `users`)  | derived from discovery `api_endpoint`                    |

## Tests

`go test ./...` covers the load-bearing offline logic: discovery contract
parsing (`internal/state`) and stack-key/topology queries
(`internal/discovery`). The network/`op`/`talosctl`/admin-api paths are not unit
tested (they need live infra).
