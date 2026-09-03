---
title: k3d and Tilt
description: Run the whole stack on a local k3d cluster with Tilt, the way it runs in production
order: 2
---

An alternative k8s-based dev flow mirrors the eventual prod topology (Helm charts, CloudNativePG, Rook-Ceph object storage, in-cluster service discovery). All required tools (k3d, kubectl, helm, tilt) are installed via mise.

```bash
mise k3d:up       # create local k3d cluster + registry
mise tilt:up      # start Tilt; builds images, renders charts, port-forwards
# edit code — live_update syncs into running pods

mise tilt:down    # stop Tilt
mise k3d:down     # delete cluster
```

## Ports

Ports forwarded to localhost:

- `5173` web, `3020` yucca-api, `3030` yucca-admin-api, `3010` michael
- `8092` mock-oidc, `8025` mailpit, `8093` mock-postmark, `9000` ceph rgw (S3)
- `8428` victoria-metrics, `9428` victoria-logs

## What Tilt deploys

Tilt deploys the **same per-app charts the Flux tree uses** — it reads the
HelmReleases under [`kubernetes/apps`](https://github.com/immich-app/yucca/blob/main/kubernetes) to discover what to deploy,
renders the charts from `kubernetes/apps/dev/local`, then builds/live-updates the images. Charts live in `charts/` (a `yucca-common`
library + per-service charts). Tilt's source of truth is the Flux tree under `kubernetes/` — see the extensively commented `Tiltfile`
and [`kubernetes/README.md`](https://github.com/immich-app/yucca/blob/main/kubernetes/README.md).

## CI resource subsets

CI deploys resource subsets rather than the whole stack (`mise tilt:ci` still does everything):
`tilt:ci-infra` (integration — postgres, mock-oidc, victoria; **no Ceph**), then for e2e
`tilt:ci-ceph` (Rook only; builds no images, so it converges while the workspace installs)
followed by `tilt:ci-e2e` (the apps the e2e suites touch). Ceph converging outweighed every test
in the integration job, so that job dropped it and its S3-backed suites moved to the e2e one.
