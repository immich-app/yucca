---
title: Development setup
description: Prerequisites, tooling conventions and the mise commands for working on the Yucca application
order: 1
---

Application code lives under `packages/`. Infrastructure that operates Yucca (Ceph storage backend, Talos K8s, deployment/state managed via Terraform+1Password) lives at the top level in `ansible/`, `tf/`, and `kubernetes/`.

## Prerequisites

Ensure you have prerequisites installed:

- [Docker](https://docs.docker.com/engine/install/)
- [mise](https://mise.jdx.dev/getting-started.html)
- [1password CLI](https://developer.1password.com/docs/cli/)

If necessary, copy `.env.example` to `.env` and customise.

Then use mise; the [common commands](#common-commands) are listed below.

An alternative k8s-based dev flow on k3d + Tilt mirrors the eventual prod topology; see [k3d and Tilt](/development/kubernetes).

## Tooling

- Everything runs through **[mise](https://mise.jdx.dev/)** tasks (`.mise/tasks/` scripts + `.mise/config.toml` aggregates). mise pins every binary (node, pnpm, go, kubectl, helm, tilt, opentofu, ansible…) — do not assume a tool is on PATH outside of mise.
- **pnpm workspaces** with a **catalog** (`pnpm-workspace.yaml`): add/bump shared deps in the catalog, referenced as `"catalog:"` in each `package.json` — not in individual packages.
- Secrets come from **1Password** via `op run`; `.env` files contain `op://` refs, never literal secrets. `OP_ACCOUNT` is set in `.env` (copy `.env.example`).

## Common commands

| Command                            | Purpose                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `mise dev`                         | compose-based dev: deps, docker infra (postgres/minio/mock-oidc/`victoria-*`), all `*:dev`         |
| `mise <pkg>:dev`                   | one service, e.g. `mise web:dev`, `mise yucca-api:dev`                                              |
| `mise docs:dev`                    | docs site (`packages/docs`) on `:36034`                                                             |
| `mise check`                       | lint + format check + svelte-check + unit tests (= the `checks` CI job)                             |
| `mise fix`                         | autofix lint/format + lingui extract                                                                |
| `mise build`                       | build all packages                                                                                  |
| `mise test`                        | all unit tests (jest per NestJS pkg, vitest for web)                                                |
| `mise test:integration`            | integration tests (`--jobs 1`; needs infra up)                                                      |
| `mise test:integration:k3d`        | CI split: the database-backed suites; `mise test:integration:s3` = the Ceph-backed ones             |
| `mise test:e2e`                    | e2e (needs the stack running); `mise test:e2e:web` = Playwright                                     |
| `mise <pkg>:test`                  | one package; args after `--` go to jest: `mise yucca-api:test -- -t "name"`                         |
| `mise yucca-api:migrations <args>` | DB migrations (`@immich/sql-tools`; yucca-api owns the schema)                                      |
