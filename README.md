# Yucca

Application code lives under `packages/`. Infrastructure that operates Yucca
(Ceph storage backend, future Talos K8s, deployment/state managed via
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
mise dev # install deps, prep environment, start servers

mise check # lint, format check, svelte check

mise test # unit tests
mise test:integration # integration tests
mise test:e2e # e2e tests
mise test:e2e:web # e2e web tests
```

## Infrastructure

| Start here                                           | Path            | Purpose                                                                                                                                               |
| ---------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ansible/ceph/README.md`](./ansible/ceph/README.md) | `ansible/ceph/` | Ansible automation for Ceph clusters (sietch, painbox). Deploys + operates via cephadm on bare-metal and Hetzner.                                     |
| [`tf/README.md`](./tf/README.md)                     | `tf/`           | Terraform/OpenTofu authority for cluster identity, 1P secret items, rendered Ansible inventories. Terragrunt multi-env (`deployment/<env>/<stack>/`). |
| (coming in follow-up)                                | `kubernetes/`   | Flux GitOps surface for the (future) Talos K8s cluster.                                                                                               |

**Secrets are managed via the `yucca_tf_*` 1Password vaults.** Runtime reads use a
read-only service account; TF writes use a superuser service account. See
`ansible/ceph/docs/secrets.md` and `tf/README.md` for the full model.

`mise run tf:init / tf:plan / tf:apply` wraps terragrunt via
`op run --env-file=tf/.env --` so the superuser token is injected from 1P at
invocation time.
