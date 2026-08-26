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

`module yuctl`, Go 1.25, `aws-sdk-go-v2` for S3, `rs/zerolog` for logging —
matching `packages/michael` — with two documented divergences: **`spf13/cobra`**
for the nested subcommand tree (michael is a single-purpose HTTP server and
stays stdlib-only; yuctl is a multi-verb CLI), and a **flat package layout**
with no `internal/` (yuctl is an unpublishable standalone module nothing else
imports, so the boundary bought nothing but a path segment). There is no
Dockerfile — yuctl is an operator CLI, not a deployed service.

The command layer follows the gh/kubectl shape: `cli/` mirrors the command
tree one package per topic (`yuctl ceph …` → `cli/ceph`, `yuctl tools warp …`
→ `cli/tools/warp`), and every command receives a `cmdutil.Factory` carrying
the lazily-resolved shared dependencies (IO streams, selected context,
memoized topology, admin-api login) instead of re-deriving them per command.

## Build

```sh
mise run yuctl:build        # → dist/yuctl
mise run yuctl:dev -- <args>  # go run . <args>
```

Or directly: `cd packages/yuctl && go build -o ../../dist/yuctl .`

## Package layout

```
packages/yuctl/
  main.go                     # yuctl entrypoint → cli.NewRootCmd().ExecuteContext
  cmd/bench-agent/            # second binary: the remote bench agent
  cli/                        # cobra wiring, one package per topic, mirrors the command tree
    root.go select.go login.go
    ceph/ infra/ config/ features/
    users/{allowlist,features,connections}/
    tools/{bench,fleetbench,warp}/
  cmdutil/                    # Factory (IO, context, topology, admin login) + Confirm/OpenBrowser
  ui/                         # IOStreams, lipgloss theme, meter/sparkline widgets
  fleet/                      # shared fleet-tool engine: watch loop, history, parallel fan-out
    warp/                     #   K8s-pod transport: warp runner fleet vs RGW
    fleetbench/               #   cloud-VM transport: restic client fleet vs michael
  sshx/                       # the one ssh/scp layer (multiplexing, retry, stdin secrets)
  resticbench/                # bench agent + orchestrator + loadgen + restic runner
  discovery/                  # S3 state reader + stack enumeration + topology queries
  state/                      # discovery output contract structs + tfstate parsing
  op/                         # `op read` / ReadToTempFile (0600) wrapper
  ctxstore/                   # ~/.config/yuctl/context.json {partition,region,ceph_cluster}
  talos/                      # talosctl upgrade wrapper
  cephhealth/                 # RGW/dashboard health probe
  adminapi/                   # CLI loopback login + Bearer admin-api client
  provider/                   # cloud-VM providers (DO, Hetzner) for fleet-bench
  do/ netdev/                 # DigitalOcean plumbing; /proc/net/dev parsing
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
│   ├── list                        list users in the partition's PRIMARY region
│   └── view-dashboard              open the grafana per-user drill-down (--id or --email)
├── config                          scoped config overrides (served to clients via /api/meta)
│   ├── list                        list every settings scope (global / site:* / cluster:*)
│   ├── get                         print one scope's overrides (--site / --cluster)
│   ├── set key=value ...           merge keys into a scope (read-modify-write PUT)
│   └── unset key ... | --all       remove keys, or clear the whole scope
└── tools
    ├── bench                       restic e2e benchmark against michael, run from a mgmt host
    │   ├── compare <a> <b>         render before/after deltas from two results files
    │   └── cleanup                 forget+prune every bench snapshot (timed)
    ├── fleet-bench                 restic client fleet on cloud VMs (--provider do|hetzner) vs michael
    │   ├── deploy                  create/converge the host fleet (project yucca-bench)
    │   ├── start                   launch the per-client backup loops (graceful restart)
    │   ├── status                  one-shot dashboard (throughput, transfer budget, clients)
    │   ├── watch                   live dashboard, continuously sampled
    │   ├── stop                    kill the load, collect + save the results JSON
    │   ├── cleanup                 forget+prune every fleet-bench repo (from the hosts)
    │   └── undeploy                destroy the hosts and the ephemeral ssh key
    └── warp                        S3 load test fleet against the region's RGW gateways
        ├── deploy                  create/converge hostNetwork runner pods on the workers
        ├── start                   launch the load (graceful restart; non-stop by default)
        ├── status                  one-shot styled dashboard (procs, errors, NIC Gbps)
        ├── watch                   live dashboard, continuously sampled (lipgloss)
        ├── stop                    kill the load, keep the runners deployed
        ├── cleanup                 purge warp buckets via an in-cluster mc Job
        └── undeploy                delete the loadtest namespace entirely
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
   `.outputs.discovery.value` into `state.Discovery`. Stacks with no
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

Every `op read` is pinned to an **account** — `--account team-futo`, overridable
with `OP_ACCOUNT` — because operators typically have more than one account
signed in and `op`'s *default* account is whatever it feels like: the vault
lookup then fails, or the desktop app prompts for the wrong account
(`authorization prompt dismissed`). When `OP_SERVICE_ACCOUNT_TOKEN` is set (CI)
the flag is dropped: the token already pins the account and `op` rejects both.
Same convention as `.mise/tasks/*` and the `Tiltfile`.

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
   and take the admin-api host from its k8s discovery `admin_api_host` (= the
   region's `YUCCA_ADMIN_HOST`), falling back to deriving it from `api_endpoint`
   (`kube.<cluster>.<region>.<provider>.yucca.futo.network` →
   `https://admin.<…>`) for pre-contract state; override with `--admin-url` or
   `YUCTL_ADMIN_API_URL`. The host is on the NetBird overlay, so the operator
   (and their browser) must be connected.
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

## `config` — scoped config overrides

Edits the mutable configuration the fleet serves to clients via the public
`GET /api/meta` endpoint (yucca-api): a scoped `settings` table where scopes
are `global`, `site:<region_code>`, or `cluster:<storage cluster code>`.
Values are validated by the admin-api against the settings registry
(`restic_pack_size_mib`, `connections_math`); unknown keys and invalid
expressions are rejected with a 400 that yuctl surfaces verbatim.

```bash
yuctl config list                                            # all scopes, one line each
yuctl config set restic_pack_size_mib=32                     # global scope
yuctl config set --site htz-fsn1 'connections_math=min(16, cores * 2)'
yuctl config get --site htz-fsn1
yuctl config unset --site htz-fsn1 connections_math          # remove one key
yuctl config unset --cluster father-spice --all              # clear a whole scope
```

`set` is read-modify-write: it merges the given keys into the scope's current
overrides and PUTs the result, so unrelated keys survive. Site and cluster
codes are validated server-side against the GitOps topology file.

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

## `tools fleet-bench` — cloud-VM restic client fleet

Drives michael from the outside: N cloud VMs (`--provider do|hetzner`) each
running real restic clients over the public internet — the actual
external-user path (DNS, edge, michael, RGW), unlike `bench` (mgmt host on
the fabric) and `warp` (in-cluster, straight at RGW). Fleet lifecycle mirrors
`warp`; fleets are per provider × partition, so several providers can load
michael at once.

```bash
yuctl select prod@htz-fsn1
yuctl login
yuctl tools fleet-bench start --hosts 6 --clients-per-host 2 \
  --obj-size 64MiB --duration 2h --label big-packs   # auto-deploys (confirms cost first)
yuctl tools fleet-bench watch       # live dashboard: Gbps, transfer budget bars, client loops
yuctl tools fleet-bench stop        # kill the load, save fleet-bench-<label>-<ts>.json
yuctl tools fleet-bench cleanup     # forget+prune the bench repos (while the hosts exist)
yuctl tools fleet-bench undeploy    # destroy the hosts + the ephemeral ssh key
```

How it works:

- **Fleet**: hosts (`--hosts`, default 3 of the provider's default size) are
  created via the provider API (DO token from
  `op://yucca/do_api_token/password` / `$DIGITALOCEAN_TOKEN`; Hetzner from
  `op://yucca_tf_prod/HCLOUD_API_TOKEN/password` / `$HCLOUD_TOKEN`),
  round-robined across `--region`, tagged `yuctl-bench-<provider>-<partition>`,
  and filed under the **`yucca-bench`** project where the provider has the
  concept. Deploy prints the hourly cost and transfer pool and asks before
  creating anything (`--yes` skips); it converges — rerunning reconciles the
  fleet to the requested size and re-pushes binaries.
- **SSH**: an **ephemeral ed25519 keypair per fleet** — generated on deploy,
  registered via the API, private key + per-fleet known_hosts under
  `~/.config/yuctl/bench-wide/` (legacy dir name), deleted on undeploy. No
  personal keys involved.
- **Clients**: one admin-api repository per client (`--clients-per-host`),
  named `yucca-benchdo-…` (legacy prefix), created on first start and reused
  across restarts; restic URLs are re-minted on every start and travel to the
  host over ssh stdin (never argv). Repo passwords live in the 0600 fleet
  state file — they are the only way back into the repos, so `cleanup` before
  `undeploy`.
- **Load**: the bench agent's **loadgen mode** runs detached (nohup) on each
  host, looping seeded generate→backup cycles per client — fresh seed every
  cycle so nothing dedups — with `--obj-size` as the restic pack size
  (4–128 MiB, what michael sees as object size), `--cycle-size` per-cycle
  dataset, `--connections` rest.connections. `--duration` bounds the run
  (`0` = non-stop until `stop`). Progress goes to a host-local status file
  that `status`/`watch` sample over ssh alongside `/proc/net/dev`.
- **Transfer cap (important)**: cloud VMs have a monthly outbound transfer
  allowance (overage is billed per GiB) and a sustained restic load can burn
  through it in hours. The agent tracks wire TX and **hard-stops the host's
  load at the allowance**; `--max-transfer` overrides. The dashboard shows a
  per-host budget bar and the fleet pool. If the fleet state is lost the cap
  is re-derived from the host size — the load never runs uncapped.
- **Results**: `stop` collects each host's final status and writes a local
  JSON (per-client cycles, post-dedup uploaded bytes, errors; per-host wire
  TX) plus a rendered summary. Pair with the michael dashboards for the
  server-side view.

## `tools warp` — RGW fleet load test

Reproduces the 2026-07-22 warp soak (~250Gbps combined on father) as an
on-demand, topology-aware tool. Everything is derived at runtime — worker
nodes and allocatable CPU from the cluster, the RGW endpoint + credentials
from discovery and the product's own secret, the gateway roster from DNS with
a liveness probe run from inside the cluster.

```bash
yuctl select prod@htz-fsn1
yuctl tools warp start            # auto-deploys, then runs non-stop until `stop`
yuctl tools warp watch            # live dashboard: NIC bars, throughput sparkline
yuctl tools warp status           # same dashboard, one-shot
yuctl tools warp stop             # kill the load; runners stay for instant restart
yuctl tools warp cleanup          # purge yuctl-warp-* buckets (in-cluster mc Job)
yuctl tools warp undeploy         # remove the loadtest namespace
```

Tuning: `--put-streams`/`--get-streams` (fleet totals) or `--put-per-pod`/
`--get-per-pod`, `--put-obj-size`/`--get-obj-size`, `--get-objects`,
`--duration` (bounded) vs `--cycle` (non-stop loop), and on deploy/start:
`--pods-per-node`, `--workers N` (pin to the first N workers), `--cpu`,
`--image`. Example scaled-down probe:

```bash
yuctl tools warp start --workers 1 --put-per-pod 32 --get-streams -1 \
  --put-obj-size 4MiB --duration 30m
```

How it works:

- **Runners**: `minio/warp` pods (2 per worker by default) on **hostNetwork**,
  so the load rides the workers' bonded NICs with no CNI hop. CPU request is
  derived from node allocatable. Manifests are `go:embed`ded templates
  (`fleet/warp/manifests/`), server-side-applied via client-go — no
  kubectl dependency. Credentials are copied from the `yucca-michael` secret
  (the same RGW svc user as the real data path).
- **Gateway roster**: the ceph cluster's `rgw_s3_endpoint` is resolved to its
  full A-record set, then TCP-probed *from a runner pod* (the vantage that
  matters); dead gateways are excluded. Every warp request round-robins over
  the explicit `--host` list — plain DNS would pin one gateway per process.
- **Load shape**: per-pod defaults are the proven config — 167 PUT + 17 GET
  streams of 16MiB objects — so totals scale with the topology (3 workers × 2
  pods = the 1002/102 ~250Gbps shape). Small GET sizes are latency-bound
  under write load; 16MiB reads shoulder through.
- **Non-stop**: without `--duration`, each pod runs a respawning loop of
  `--cycle` (6h) warp runs with `--noclear`, accumulating data until
  `cleanup`. `start` is a graceful restart: it kills the previous load first.
- **`status`** samples `/proc/net/dev` on one pod per node and reports the
  busiest physical interface's TX/RX, plus warp process and log-error counts.
- **`cleanup`** runs an in-cluster `mc` Job (RGW IPs are fabric-internal) and
  purges buckets by prefix; `--legacy` also removes the pre-yuctl soak
  buckets. A mass delete is itself a load event — RGW GC churns afterwards.

Works identically against staging (`yuctl select staging@austin`) — nothing
about the fleet size, gateway count, or endpoints is hardcoded.

## Environment variables

| Variable                                             | Purpose                                | Default                                                  |
| ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`        | state-bucket creds (skip op)           | resolved via op                                          |
| `YUCTL_TF_STATE_ACCESS_KEY_REF` / `…_SECRET_KEY_REF` | op refs for state creds                | `op://yucca_tf/TF_STATE_S3_{ACCESS,SECRET}_KEY/password` |
| `YUCTL_TF_DEPLOYMENT_DIR`                            | force the local stack-enumeration dir  | walk up for `tf/deployment`                              |
| `OP_BIN`                                             | 1Password CLI binary                   | `op`                                                     |
| `YUCTL_ADMIN_API_URL`                                | admin-api base URL (`login`, `users`)  | derived from discovery `api_endpoint`                    |
| `YUCTL_GRAFANA_URL`                                  | grafana base (`users view-dashboard`)  | `https://grafana.futostatus.com`                         |
| `DIGITALOCEAN_TOKEN`                                 | DO API token (`tools fleet-bench`)     | resolved via op                                          |
| `YUCTL_DO_TOKEN_REF`                                 | op ref for the DO token                | `op://yucca/do_api_token/password`                       |
| `HCLOUD_TOKEN`                                       | Hetzner API token (`tools fleet-bench`)| resolved via op                                          |
| `YUCTL_HCLOUD_TOKEN_REF`                             | op ref for the Hetzner token           | `op://yucca_tf_prod/HCLOUD_API_TOKEN/password`           |

## Tests

`go test ./...` covers the load-bearing offline logic: discovery contract
parsing (`state`) and stack-key/topology queries
(`discovery`). The network/`op`/`talosctl`/admin-api paths are not unit
tested (they need live infra).
