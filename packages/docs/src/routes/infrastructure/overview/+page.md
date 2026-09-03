---
title: Overview
description: The fleet model, how the tf, ansible, kubernetes and charts directories fit together, naming conventions and the mise commands that drive them
order: 1
---

Yucca is a multi-tenant **backup service**: OIDC-authenticated users get S3-backed [restic](https://restic.net/) repositories. Application code lives under `packages/`. The infrastructure that operates Yucca (the Ceph storage backend, Talos K8s, deployment and state managed via Terraform and 1Password) lives at the top level of the repository in `ansible/`, `tf/` and `kubernetes/`, with the in-repo Helm charts under `charts/`.

## Fleet model

Everything is keyed on a single topology: **`partition → region → { one K8s cluster, one-or-more Ceph clusters }`**.

- Partitions are `prod`, `staging` and `dev`.
- Regions are sites such as `htz-fsn1`, `austin` and `local`, plus `global`.
- The slug is `<partition>-<region>`, for example `prod-htz-fsn1`.

The [Terraform](/infrastructure/terraform) page describes the model in full, including the `global` pseudo-region and how partition, region and stack are derived from the directory path.

## Repository layout

- **`tf/`** — OpenTofu + Terragrunt (`deployment/<partition>/<region>/<stack>/`, shared logic in `shared/modules/`). Every stack emits a non-sensitive **`discovery` output** consumed by [yuctl](/operations/yuctl), Kubernetes and Ansible; secrets in it are `op://` refs. See [Terraform](/infrastructure/terraform).
- **`ansible/`** — [`ceph/`](/infrastructure/ceph) (cephadm bare-metal), [`talos/`](/infrastructure/talos) (Talos VMs on the Ceph hypervisors — VM provisioning only; talosctl is owned by the TF siderolabs provider), [`mgmt/`](/infrastructure/management-hosts) (management hosts + NetBird). Roles gated by `*_enabled` flags.
- **`kubernetes/`** — **Flux GitOps**. `clusters/<partition>/<region>/` entry points; `apps/{base,<overlays>,dev/local}/` HelmReleases; `components/` Kustomize Components per role. Config layers merged via postBuild: `cluster-settings.generated.yaml` (TF), `cluster-settings.yaml` (human), `image-versions` (CI). See [Kubernetes](/infrastructure/kubernetes).
- **`charts/`** — in-repo Helm charts; `lib/yucca-common` library chart + `apps/<svc>` charts. Service names pinned via `fullnameOverride` so DNS is identical under Tilt and Flux.
- **`o11y/`** — everything yucca ships to the o11y cluster, packaged as grafana-operator CRs inside a single OCI artifact on GHCR. See [Observability](/infrastructure/observability).

Merges to main are built by CI, auto-promoted to staging by Flux and promoted to prod by merging the release-please PR, as described on the [Releases](/development/releases) page.

**Secrets are managed via the `yucca_tf_*` 1Password vaults.** Runtime reads use a read-only service account; TF writes use a superuser service account. See the [Ceph secrets document](https://github.com/immich-app/yucca/blob/main/ansible/ceph/docs/secrets.md) and the [Terraform](/infrastructure/terraform) page for the full model.

| Start here                              | Path             | Purpose                                                                                                                                                   |
| --------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Ceph](/infrastructure/ceph)             | `ansible/ceph/`  | Ansible automation for Ceph clusters (sietch). Deploys + operates via cephadm on bare-metal and Hetzner.                                                  |
| [Talos](/infrastructure/talos)           | `ansible/talos/` | Talos K8s as libvirt VMs on the Ceph hypervisors. Ansible provisions the substrate + VMs; TF renders inventory and bootstraps the cluster.                |
| [Terraform](/infrastructure/terraform)   | `tf/`            | Terraform/OpenTofu authority for cluster identity, 1P secret items, rendered Ansible inventories. Terragrunt multi-env (`deployment/<partition>/<region>/<stack>/`). |
| [Kubernetes](/infrastructure/kubernetes) | `kubernetes/`    | Flux GitOps surface (apps/components/flux/bootstrap) for the Talos K8s cluster. Per-app HelmReleases over the in-repo `charts/`; mirrored locally by Tilt. |

## Naming

- **Clusters are themed by workload**: Kubernetes → Star Wars (`luke` = staging, `father` = soon-to-be prod); Ceph → Dune (`sietch`, `spice`, …).
- **Node hostnames**: `<product>-<provider>-<region>-<clustername>-<role>-<nodename>`, e.g. `yucca-int-aus-luke-k8s-<word>`. Provider/region are the 3-letter codes from the region's `region.hcl` (austin = `int`/`aus`, htz-fsn1 = `htz`/`fsn`); role is `k8s` or `ceph`; `<nodename>` auto-picks from `tf/shared/modules/node-names/wordlist.txt` (deterministic per cluster; pass an explicit `name` to override).

## Commands

```bash
mise tf:plan / tf:init / tf:fmt    # terragrunt (TF_STACK_DIR=tf/deployment/<partition>/<region>/<stack>)
mise k8s:validate                  # helm template + kubeconform + flux-local of the k8s tree (no cluster)
mise mgmt:render-inventory / mgmt:ansible
```

The `tf:*` tasks wrap terragrunt via `op run --env-file=tf/.env --` so the superuser token is injected from 1Password at invocation time.

**CI owns terraform applies** ([infra.yml](https://github.com/immich-app/yucca/blob/main/.github/workflows/infra.yml) on merge to main). Locally you may `tf:plan` but never `tf:apply`. Gotcha: unset the shell's stray `AWS_CA_BUNDLE` before planning — it breaks the OVH S3 state backend. We own the `futo-org/netbird` provider (`../terraform-provider-netbird`, pin ≥ 1.0.2); renaming a NetBird setup key forces replacement (the API can't rename keys), regenerating its value.
