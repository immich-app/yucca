# Kubernetes (Flux GitOps)

This directory holds **two parallel trees** with different consumers:

```
kubernetes/
├── clusters/                 # ← real clusters (partition/region GitOps; reconciled by Flux)
│   ├── staging/austin/       #   cluster-settings(.generated) + apps.yaml (cluster-apps entry)
│   ├── prod/htz-fsn1/         #   + flux-release + image-versions (prod pins, release-please-stamped)
│   └── dev/local/            #   ← dev-mirror entry point (repos.yaml + apps.yaml; consumed by Tilt)
├── apps/
│   ├── base/                 #   reusable HelmReleases (chart + image.repository); tag via ${YUCCA_IMAGE_TAG:=}
│   ├── staging/austin/       #   overlay: components [infra, roles/primary] + flux-system/ (image automation, notifications)
│   ├── prod/htz-fsn1/         #   overlay: components [infra, roles/primary] + flux-system/ (notifications)
│   └── dev/local/            #   ← dev-mirror tree (Tilt/k3d only): yucca/ rook-ceph/ cnpg-system/ repos/
├── components/               #   apps/<app>.yaml (single-source Flux Ks), infra/ (platform layers),
│   │                         #   roles/{primary,secondary}/ (Kustomize Components: per-role app sets)
├── bootstrap/
```

- **`clusters/<partition>/<region>/` + `apps/{base,<partition>/<region>}/` + `components/`**
  is the GitOps surface for the real Talos clusters. The flux-instance (installed
  by `tf/deployment/staging/austin/talos/flux.tf`) syncs `clusters/<partition>/<region>`;
  merge→build→deploy is driven by `.github/workflows/deploy.yml`. Each cluster
  overlay picks its app set by composing two Kustomize Components: `infra`
  (role-independent platform layers) and `roles/<role>` (the role's app set).
  See **GitOps deploy** below.
- **`apps/dev/local/` + `clusters/dev/local/`** is the dev-mirror tree the
  [Tiltfile](../Tiltfile) consumes for local k3d dev. Tilt scans only
  `apps/dev/local/` (allow-list) and reads HelmRepository sources from
  `apps/dev/local/repos/`. It keeps its own literal-valued HelmReleases (Tilt
  can't resolve Flux `${...}` substitutions).

## GitOps deploy (staging → production)

Merging to `main` runs `.github/workflows/deploy.yml`:

This is **pull-based** — CI only builds+pushes; the clusters pull. CI never holds
a kubeconfig or joins the tailnet.

1. **build** — matrix-builds every app image → `ghcr.io/immich-app/yucca/<app>:0.0.<run_number>`
   (+ `:sha-<sha>` for traceability, `:main`). One monotonic monorepo tag for all apps.
2. **staging (automatic, in-cluster)** — the flux-operator `ResourceSetInputProvider`
   (`apps/staging/austin/flux-system/image-automation.yaml`, type `OCIArtifactTag`) detects the
   highest `0.0.<n>` tag in GHCR; a `ResourceSet` writes it into the `image-versions`
   ConfigMap, which the `cluster-apps` `postBuild.substituteFrom` feeds into every app
   HelmRelease as `${YUCCA_IMAGE_TAG}`. No GHA job, no git commit.
3. **production (gated by the release PR)** — release-please stamps the next release
   tag into BOTH prod pins (`clusters/prod/htz-fsn1/flux-release.yaml` and
   `image-versions.yaml`, extra-files), so **merging the release PR is the promotion**:
   prod's `flux-release` GitRepository jumps to the tag (manifests + charts) and
   `${YUCCA_IMAGE_TAG}` selects the matching `v<version>` images (pushed by the same
   commit's build job — the rollout stalls harmlessly for the few minutes that build
   takes). No promote workflow, no bot commit, still no cluster access from CI.
   **Rollback** = revert the two stamped lines in a normal PR; the old tag's images
   still exist.
4. **visibility** — notification-controller's GitHub `Provider`/`Alert`
   (`apps/<partition>/<region>/flux-system/notifications.yaml`) posts each reconcile result as a
   **commit status** (✅/❌ on the deployed commit). (Trade-off vs the old push model:
   the rollout no longer streams in the Actions log — it surfaces as the commit status.)

### Prerequisites (provisioned out-of-band)

- (No GitHub Environment needed — the prod gate is the reviewed release-please PR; staging is fully in-cluster.)
- **CI secrets**: just `PUSH_O_MATIC_*` (already exist) for the prod-pin commit + `GITHUB_TOKEN` for the GHCR push. (Tailscale / `OP_*` cluster secrets are no longer needed.)
- **Cluster secret (TF-provisioned from 1P)**: just the commit-status credential, via a **dedicated `yucca-flux` GitHub App** (no PAT) with only *Commit statuses: write* — `TF_VAR_flux_github_app_id`, `TF_VAR_flux_github_app_installation_id`, `TF_VAR_flux_github_app_private_key`. No git-sync or GHCR pull secret: yucca is a public repo with public images, so Flux reads both unauthenticated.
- **Flux bootstrap**: `tf apply` the staging stack (`flux.tf`) with those `TF_VAR`s set, after these manifests are on `main`.
- **zizmor**: SHA-pin the `# TODO: pin to SHA` actions in `deploy.yml` before merge.

## End-to-end tests against the local k3d stack

The e2e suites (`packages/e2e` + the web Playwright test) are written for a
host-local environment, while this stack runs in k3d. One command bridges them:

```bash
mise k3d:up && mise tilt:up     # stack healthy (context k3d-yucca)
mise test:e2e:k3d               # runs all e2e against the cluster
```

`mise test:e2e:k3d` (see `packages/e2e/k3d/run.sh`):

- **orchestration-api runs as a separate local process** (`:22676`) — it is
  intentionally _not_ deployed to k8s; it targets the port-forwarded web.
- port-forwards the cluster services to the host ports the suites expect
  (michael `:3010`, yucca-api `:3020`, mock-oidc `:8092`, web `:36033` + `:5173`).
- resolves the in-cluster OIDC issuer host (`yucca-mock-oidc`) on the host with
  a Node DNS preload (jest) and Chromium `--host-resolver-rules` (Playwright) —
  no `/etc/hosts`/sudo needed.
- sets `RESTIC_ENDPOINT=localhost:3010` on yucca-api **for the test run only**
  (restic runs on the host; the chart keeps the in-cluster `yucca-michael`),
  reverted on exit.

Note: michael creates **one S3 bucket per restic repository** (the bucket name
comes from the client JWT's `repository` claim; the S3 credentials are a static
RGW user). That's why it uses a full `CephObjectStoreUser` (charts/platform/ceph-objectuser)
rather than a bucket-scoped ObjectBucketClaim.

## How it reconciles

In dev, Flux applies `kubernetes/clusters/dev/local` first (`cluster-repos` →
`cluster-apps`). `cluster-apps` builds `kubernetes/apps/dev/local`, which
aggregates one Flux `Kustomization` (`ks.yaml`) per app. Each `ks.yaml`
reconciles its `app/` directory, whose `kustomization.yaml` applies a single
`HelmRelease`. Ordering is expressed with `dependsOn` (operator → database → apps).

```
apps/dev/local/yucca/<app>/
├── ks.yaml              # Flux Kustomization → ./app  (+ dependsOn)
└── app/
    ├── kustomization.yaml
    └── helmrelease.yaml # chart ref + values
```

(On the real clusters the equivalent single-source Flux `Kustomization`s live in
`components/apps/<app>.yaml`, selected per cluster by the `roles/<role>`
Component.)

## Single source of truth: this tree

The [Tiltfile](../Tiltfile) derives **everything it deploys** from the
HelmReleases here — first-party apps _and_ the remote-chart operators:

- First-party `HelmRelease`s reference the in-repo Helm charts via the `yucca`
  `GitRepository` source (`chart: charts/apps/<svc>`), so **no OCI publishing is
  required**. Tilt renders the same charts with their dev defaults and injects
  the locally-built, live-updated images.
- Remote `HelmRelease`s (cnpg, rook, victoria-\*) pin a chart version + values;
  Tilt installs **exactly those**, from the `HelmRepository` sources declared in
  `apps/dev/local/repos/`. Bump a version or value once, in the HelmRelease — there is no
  second copy to drift.

Service names are pinned with `fullnameOverride` in each chart's `values.yaml`,
so in-cluster DNS is identical whether a chart is rendered by Tilt (release
`yucca`) or by Flux (per-app release names).

| Layer    | Reconciler | Image source                                | First-party values                         |
| -------- | ---------- | ------------------------------------------- | ------------------------------------------ |
| **Dev**  | Tilt       | `docker_build` → k3d registry, live-updated | chart defaults (`values.yaml`)             |
| **Prod** | Flux       | `ghcr.io/...` (per `HelmRelease`)           | chart defaults + `HelmRelease.spec.values` |

## Dev vs prod

This tree currently mirrors the **dev** stack so it stays 1:1 with Tilt. Items
marked `TODO(prod)` (image registries, real OIDC/S3 endpoints, ingress, probes,
persistence, secrets) are where a future prod cluster overlay diverges. Notably:

- `mock-oidc` and `rook-ceph` are **dev-only**. Prod swaps in a real IdP, and
  prod object storage is a **completely separate** Ceph (the bare-metal cluster
  in [`ansible/ceph`](../ansible/ceph) / [`tf/`](../tf)) — not this Rook cluster.
- The Rook-Ceph dev cluster is single-node/single-replica and synthesizes a
  loopback block device (k3d has no spare disk). See
  [`charts/platform/rook-ceph-cluster`](../charts/platform/rook-ceph-cluster). `michael`'s S3
  credentials come from a full RGW user
  ([`charts/platform/ceph-objectuser`](../charts/platform/ceph-objectuser)) whose Secret Rook
  writes into the `yucca` namespace.
- The dev keypair/secrets committed in chart `secretData` are **well-known
  fixtures** (the same keypair lives in `.mise/tasks/*/env`); they must become
  `ExternalSecret`s backed by the org's 1Password (External Secrets Operator)
  before prod.
- **`redis` (valkey)** is the restic-token revocation denylist. It is
  deliberately ephemeral (no persistence): the metrics-worker re-seeds it from
  the DB every 5 min, and michael fails **open**, so losing it degrades to
  "revocations delayed", never "backups broken". It is **primary-region only**
  — a partition's primary region owns the DB and the reconcile job, so it's the
  only place that can populate the denylist. Secondary regions run `michael`
  with `REDIS_ADDR` unset (revocation checking off) until a cross-region design
  lands (options: valkey `REPLICAOF` to secondaries, or cross-region reads).
  Wired into `components/roles/primary` only; `allow-ingress-redis` in
  `networkpolicies.yaml` restricts 6379 to the apps + michael.

## Real OIDC credentials in dev (`.env` + 1Password)

The k3d stack runs against mock-oidc out of the box. To point `yucca-api` at a
real IdP, drop a (gitignored) `.env` at the repo root — values may be
1Password `op://` references, resolved through the `op` CLI when the Tiltfile
loads:

```bash
OP_ACCOUNT="team-futo.1password.com"   # only needed with multiple 1P accounts
OIDC_ISSUER="https://external-dev-gkhk8b.us1.zitadel.cloud"
OIDC_CLIENT_ID="op://yucca_tf_dev/CUSTOMER_ZITADEL_OAUTH_CLIENT_ID_DEV_TEST/password"
OIDC_CLIENT_SECRET="op://yucca_tf_dev/CUSTOMER_ZITADEL_OAUTH_CLIENT_SECRET_DEV_TEST/password"
```

Tilt turns the resolved pairs into the `yucca-dev-env` Secret and layers it
onto `yucca-api` as its last `envFrom` source (last source wins), so any key
here overrides the committed dev fixtures. `OIDC_ISSUER`/`OIDC_REDIRECT_URI`/
`OIDC_LOGOUT_REDIRECT_URI` are pinned by the chart as explicit env (which
beats `envFrom`) and are mapped onto their Helm values instead — keep those
three non-secret, as Helm flags are visible in the Tilt UI. Editing or
deleting `.env` redeploys automatically; without it (CI, fresh clones)
nothing changes.

Caveats: the IdP must allow `http://localhost:5173/api/auth/oidc/callback` as
a redirect URI; the device flow (`OIDC_DEVICE_*`) stays on mock-oidc; and the
web e2e suite logs in via mock-oidc, so remove `.env` before
`mise test:e2e:k3d`.

## Validate locally

```bash
# the full CI gate (charts + every cluster's Flux tree)
mise run k8s:validate
# or, ad hoc: render one dev overlay's kustomize graph
kubectl kustomize kubernetes/apps/dev/local
# build one cluster's whole tree (Kustomizations + HelmReleases) as Flux would
# (https://github.com/allenporter/flux-local)
flux-local build all kubernetes/clusters/dev/local --enable-helm --no-enable-dns
```
