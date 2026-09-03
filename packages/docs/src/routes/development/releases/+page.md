---
title: Releases and deployment
description: How a merge to main becomes a staging rollout, how a release-please PR promotes it to production, and how to roll back
order: 4
---

Deploy flow: merge to main → CI builds `0.0.<run_number>` images → Flux auto-promotes to staging → prod is promoted by merging the release-please PR (stamps both prod pins under `kubernetes/clusters/prod/htz-fsn1/`).

This is **pull-based**: CI only builds and pushes images; the clusters pull. CI never holds a kubeconfig or joins the tailnet. The Flux tree that both environments reconcile from is described in [Kubernetes](/infrastructure/kubernetes).

## Build tags

Merging to `main` runs the Deploy workflow (`.github/workflows/deploy.yml`). Its **build** job matrix-builds every app image → `ghcr.io/immich-app/yucca/<app>:0.0.<run_number>` (+ `:sha-<sha>` for traceability, `:main`). Building and pushing these images is the only delivery action CI performs.

`BUILD_TAG` (`0.0.<run_number>`) is one monotonic monorepo build tag for all apps: every app ships together. The workflow queues every run FIFO instead of coalescing pending ones, so the tag stays monotonic. Delivery is main-only: a manual dispatch on any other ref fails rather than building and tagging images from an unmerged tree.

Before anything builds, a **migration ordering gate** checks the new migrations against `HEAD^`. A migration that sorts before one already executed makes every yucca-api and yucca-admin-api pod crashloop at boot (Kysely refuses the whole set), and the stale-branch case escapes PR CI because checks do not re-run when main moves. Gating the build means a bad merge stops in CI instead of rolling out.

Release commits build like any other. The `v<version>` image tags used by production are published separately by the Release Images workflow on the release event, decoupled from the Deploy workflow's queue.

## Staging

Staging deploys **automatically, in-cluster**. The flux-operator `ResourceSetInputProvider` (`kubernetes/apps/staging/austin/flux-system/image-automation.yaml`, type `OCIArtifactTag`) detects the highest `0.0.<n>` tag in GHCR; a `ResourceSet` writes it into the `image-versions` ConfigMap, which the `cluster-apps` `postBuild.substituteFrom` feeds into every app HelmRelease as the `YUCCA_IMAGE_TAG` substitution. No GHA job, no git commit.

## Production promotion

Production is **gated by the release PR**. release-please stamps the next release tag into BOTH prod pins (`kubernetes/clusters/prod/htz-fsn1/flux-release.yaml` and `image-versions.yaml`, via extra-files), so **merging the release PR is the promotion** and it goes through normal review: no promote workflow, no bot push to main, still no cluster access from CI.

On merge, prod's `flux-release` GitRepository jumps to the tag (manifests + charts) and `YUCCA_IMAGE_TAG` selects the matching `v<version>` images. The Release Images workflow publishes those on the release event: it waits for the commit's Deploy build, then retags its images digest-identically, or builds from the tag tree. Until the images exist the rollout stalls harmlessly.

## Rollback

Rollback = revert the two stamped lines in a normal PR; the old tag's images still exist.

## Visibility

notification-controller's GitHub `Provider`/`Alert` (`kubernetes/apps/<partition>/<region>/flux-system/notifications.yaml`) posts each reconcile result as a **commit status** (success or failure on the deployed commit). The trade-off against the old push model is that the rollout no longer streams in the Actions log; it surfaces as the commit status instead.

## Prerequisites

These are provisioned out-of-band:

- **No GitHub Environment** is needed: the prod gate is the reviewed release-please PR, and staging is fully in-cluster.
- **CI secrets**: just `PUSH_O_MATIC_*` for the prod-pin commit and `GITHUB_TOKEN` for the GHCR push. Tailscale and `OP_*` cluster secrets are not needed.
- **Cluster secret (TF-provisioned from 1Password)**: just the commit-status credential, via a **dedicated `yucca-flux` GitHub App** (no PAT) with only _Commit statuses: write_ (`TF_VAR_flux_github_app_id`, `TF_VAR_flux_github_app_installation_id`, `TF_VAR_flux_github_app_private_key`). No git-sync or GHCR pull secret: yucca is a public repo with public images, so Flux reads both unauthenticated.
- **Flux bootstrap**: `tf apply` the staging stack (`flux.tf`) with those `TF_VAR`s set, after the manifests under `kubernetes/` are on `main`.

## PR image checks

Deploy builds images only on merge to main, so a broken Dockerfile would ship its failure past review and surface post-merge (fail-fast is off there; the bad app just never delivers). The Image Build Check workflow (`.github/workflows/build-check.yml`) builds changed apps' images on the PR, without pushing, so the Dockerfile is exercised where the diff is still reviewable.

It has no paths filter, because a workflow that sometimes does not run can never be a required status. A cheap always-on `changes` job detects which apps the PR touches; PRs outside the image surface skip every build. Because the build legs come from a dynamic matrix and cannot be named in branch protection, the single `Result` check is the one branch protection requires: it allow-lists the good outcomes (the build may be skipped when no app changed) so failed and cancelled runs both stay red.
