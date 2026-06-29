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
    adminapi/                 # OIDC device flow + cookie-auth admin-api client
```

## Command tree

```
yuctl
├── select <partition>@<region>     validate vs discovery → write context (clears ceph)
├── ceph
│   ├── select <name>               validate vs region's ceph_clusters keys → nest in context
│   └── get
│       └── health                  probe ceph_clusters[name] RGW/dashboard health
├── infra
│   └── talos
│       └── upgrade                 talosctl upgrade CP nodes (--dry-run, confirm/--yes, --image)
└── users
    └── list                        list users in the partition's PRIMARY region (UNTESTED)
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

## `users list` — UNTESTED against a live admin-api

`users list` is implemented to spec but **has not been exercised end-to-end**,
because it depends on out-of-band setup that does not exist yet:

- a **public OIDC device client** registered for the admin scope (the device
  client id today lives only for `yucca-api`, not the admin issuer), and
- **admin-api ingress exposure** — `yucca-admin-api` is in-cluster-only at the
  moment.

What it does when those exist:

1. Resolve the partition's **primary** region (`discovery.role == "primary"`).
2. Derive the admin-api base URL from `region_meta.domain`
   (`https://yucca-admin-api.<domain>`); override with `--admin-url` or
   `YUCTL_ADMIN_API_URL`.
3. Run the **OAuth 2.0 device-authorization flow** against the Zitadel issuer
   (`--issuer` / `OIDC_ADMIN_ISSUER`) using the public device client
   (`--client-id` / `OIDC_ADMIN_DEVICE_CLIENT_ID`), print the verification
   prompt, poll the token endpoint, and resolve the subject via OIDC userinfo.
   The token is cached at 0600 (`admin-token-<partition>.json`); `--reauth`
   forces a fresh login.
4. Call `GET /api/user` (cursor-paginated via `nextCursor`, `--limit` page size).

**Auth is COOKIE-based, not Bearer.** The admin-api validates the
`yucca-admin-sub` + `yucca-admin-access-token` cookies by calling OIDC userinfo
(`packages/yucca-admin-api/src/services/auth.service.ts`,
`src/middleware/auth.guard.ts`, cookie names in `src/enum.ts`). yuctl sends both
cookies and never an `Authorization` header.

## Environment variables

| Variable                                             | Purpose                                | Default                                                  |
| ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`        | state-bucket creds (skip op)           | resolved via op                                          |
| `YUCTL_TF_STATE_ACCESS_KEY_REF` / `…_SECRET_KEY_REF` | op refs for state creds                | `op://yucca_tf/TF_STATE_S3_{ACCESS,SECRET}_KEY/password` |
| `YUCTL_TF_DEPLOYMENT_DIR`                            | force the local stack-enumeration dir  | walk up for `tf/deployment`                              |
| `OP_BIN`                                             | 1Password CLI binary                   | `op`                                                     |
| `OIDC_ADMIN_ISSUER`                                  | admin OIDC issuer (`users list`)       | — (flag `--issuer`)                                      |
| `OIDC_ADMIN_DEVICE_CLIENT_ID`                        | public device client id (`users list`) | — (flag `--client-id`)                                   |
| `YUCTL_ADMIN_API_URL`                                | admin-api base URL (`users list`)      | derived from region domain                               |

## Tests

`go test ./...` covers the load-bearing offline logic: discovery contract
parsing (`internal/state`) and stack-key/topology queries
(`internal/discovery`). The network/`op`/`talosctl`/admin-api paths are not unit
tested (they need live infra).
