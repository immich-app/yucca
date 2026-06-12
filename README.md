# Yucca

Application code lives under `packages/`. Infrastructure that operates Yucca
(Ceph storage backend, Talos K8s, deployment/state managed via
Terraform+1Password) lives at the top level in `ansible/`, `tf/`, and
`kubernetes/`.

## Development Guide (application)

Ensure you have prerequisites installed:

- [Docker](https://docs.docker.com/engine/install/)
- [mise](https://mise.jdx.dev/getting-started.html)
- [1password CLI](https://developer.1password.com/docs/cli/)

If necessary, copy `.env.example` to `.env` and customise.

Then use mise:

```bash
mise dev # install deps, prep environment, start servers (compose-based)

mise check # lint, format check, svelte check

mise test # unit tests
mise test:integration # integration tests
mise test:e2e # e2e tests
mise test:e2e:web # e2e web tests
```

### Running on k3d + Tilt (Kubernetes)

An alternative k8s-based dev flow mirrors the eventual prod topology (Helm charts, CloudNativePG, Rook-Ceph object storage, in-cluster service discovery). All required tools (k3d, kubectl, helm, tilt) are installed via mise.

```bash
mise k3d:up       # create local k3d cluster + registry
mise tilt:up      # start Tilt; builds images, renders charts, port-forwards
# edit code — live_update syncs into running pods

mise tilt:down    # stop Tilt
mise k3d:down     # delete cluster
```

Ports forwarded to localhost:

- `5173` web, `3020` yucca-api, `3030` yucca-admin-api, `3010` michael
- `8092` mock-oidc, `9000` ceph rgw (S3)
- `8428` victoria-metrics, `9428` victoria-logs

Tilt deploys the **same per-app charts the Flux tree uses** — it reads the
HelmReleases under [`kubernetes/apps`](./kubernetes) to discover what to deploy,
then builds/live-updates the images. Charts live in `charts/` (a `yucca-common`
library + per-service charts). See [`kubernetes/README.md`](./kubernetes/README.md).

## Infrastructure

| Start here                                             | Path             | Purpose                                                                                                                                                    |
| ------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ansible/ceph/README.md`](./ansible/ceph/README.md)   | `ansible/ceph/`  | Ansible automation for Ceph clusters (sietch, painbox). Deploys + operates via cephadm on bare-metal and Hetzner.                                          |
| [`ansible/talos/README.md`](./ansible/talos/README.md) | `ansible/talos/` | Talos K8s as libvirt VMs on the Ceph hypervisors. Ansible provisions the substrate + VMs; TF renders inventory and bootstraps the cluster.                 |
| [`tf/README.md`](./tf/README.md)                       | `tf/`            | Terraform/OpenTofu authority for cluster identity, 1P secret items, rendered Ansible inventories. Terragrunt multi-env (`deployment/<env>/<stack>/`).      |
| [`kubernetes/README.md`](./kubernetes/README.md)       | `kubernetes/`    | Flux GitOps surface (apps/components/flux/bootstrap) for the Talos K8s cluster. Per-app HelmReleases over the in-repo `charts/`; mirrored locally by Tilt. |

**Secrets are managed via the `yucca_tf_*` 1Password vaults.** Runtime reads use a
read-only service account; TF writes use a superuser service account. See
`ansible/ceph/docs/secrets.md` and `tf/README.md` for the full model.

`mise run tf:init / tf:plan / tf:apply` wraps terragrunt via
`op run --env-file=tf/.env --` so the superuser token is injected from 1P at
invocation time.
