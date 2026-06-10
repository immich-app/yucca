# Kubernetes (Flux GitOps)

Flux GitOps surface for the Yucca cluster, laid out in the
[home-operations](https://github.com/onedr0p/cluster-template) convention:

```
kubernetes/
├── bootstrap/     # one-time Flux install notes for a fresh cluster
├── flux/          # Flux sources (GitRepository/HelmRepository) + cluster entrypoint
├── components/    # reusable Kustomize components (cross-app concerns)
└── apps/          # applications, grouped by namespace
    ├── cnpg-system/   # CloudNativePG operator
    ├── rook-ceph/     # Rook-Ceph operator + dev cluster (S3 object store)
    └── yucca/         # the product stack + its dev infra
```

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
RGW user). That's why it uses a full `CephObjectStoreUser` (charts/ceph-objectuser)
rather than a bucket-scoped ObjectBucketClaim.

## How it reconciles

Flux applies `kubernetes/flux/cluster` first (`cluster-repos` → `cluster-apps`).
`cluster-apps` builds `kubernetes/apps`, which aggregates one Flux `Kustomization`
(`ks.yaml`) per app. Each `ks.yaml` reconciles its `app/` directory, whose
`kustomization.yaml` applies a single `HelmRelease`. Ordering is expressed with
`dependsOn` (operator → database → apps).

```
apps/yucca/<app>/
├── ks.yaml              # Flux Kustomization → ./app  (+ dependsOn)
└── app/
    ├── kustomization.yaml
    └── helmrelease.yaml # chart ref + values
```

## Single source of truth: this tree

The [Tiltfile](../Tiltfile) derives **everything it deploys** from the
HelmReleases here — first-party apps _and_ the remote-chart operators:

- First-party `HelmRelease`s reference the in-repo Helm charts via the `yucca`
  `GitRepository` source (`chart: charts/<svc>`), so **no OCI publishing is
  required**. Tilt renders the same charts with their dev defaults and injects
  the locally-built, live-updated images.
- Remote `HelmRelease`s (cnpg, rook, victoria-\*) pin a chart version + values;
  Tilt installs **exactly those**, from the `HelmRepository` sources declared in
  `flux/repos/`. Bump a version or value once, in the HelmRelease — there is no
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
  [`charts/rook-ceph-cluster`](../charts/rook-ceph-cluster). `michael`'s S3
  credentials come from a full RGW user
  ([`charts/ceph-objectuser`](../charts/ceph-objectuser)) whose Secret Rook
  writes into the `yucca` namespace.
- The dev keypair/secrets committed in chart `secretData` are **well-known
  fixtures** (the same keypair lives in `.mise/tasks/*/env`); they must become
  `ExternalSecret`s backed by the org's 1Password (External Secrets Operator)
  before prod.

## Validate locally

```bash
# render the kustomize graph
kubectl kustomize kubernetes/apps
# build the whole tree (Kustomizations + HelmReleases) the way Flux would
# (https://github.com/allenporter/flux-local)
flux-local build all kubernetes --enable-helm --no-enable-dns
```
