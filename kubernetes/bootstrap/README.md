# Bootstrap (fresh cluster → Flux-managed)

One-time procedure to take an empty cluster to a self-reconciling Flux install
of this tree. Everything after step 3 is GitOps — no further kubectl needed.

## 1. Install Flux

```bash
flux check --pre
flux install   # or the flux-operator, once we adopt it
```

## 2. Git auth (the repo is private)

`kubernetes/apps/dev/local/repos/git-yucca.yaml` references `secretRef: yucca-repo-auth`.
Create it before applying anything, using a read-only deploy key (preferred)
or a fine-grained PAT:

```bash
# deploy key (read-only) — add the printed public key to the GitHub repo
flux create secret git yucca-repo-auth \
  --url=ssh://git@github.com/immich-app/yucca \
  --ssh-key-algorithm=ecdsa --ssh-ecdsa-curve=p521

# …or a fine-grained PAT over https
flux create secret git yucca-repo-auth \
  --url=https://github.com/immich-app/yucca \
  --username=git --password="$GITHUB_TOKEN"
```

If you use the ssh deploy key, switch `spec.url` in `git-yucca.yaml` to the
`ssh://git@github.com/...` form.

## 3. Seed the sources + entrypoint from the local checkout

The `cluster-repos`/`cluster-apps` Kustomizations pull from the `yucca`
GitRepository — which doesn't exist until something applies it. Break the
chicken-and-egg from your checkout:

```bash
kubectl apply -k kubernetes/apps/dev/local/repos   # GitRepository + HelmRepositories
kubectl apply -k kubernetes/clusters/dev/local     # cluster-repos -> cluster-apps
```

From here Flux owns the tree: it reconciles `kubernetes/apps/dev/local/repos`
(including any future source changes) and `kubernetes/apps/dev/local`.

## 4. Watch it converge

```bash
flux get kustomizations --watch
flux get helmreleases -A
```

Expected order: operators (`cnpg-operator`, `rook-ceph-operator`) →
`rook-ceph-cluster` → `yucca-database`/`yucca-object-user` → apps → `yucca-web`.

> **Before pointing this at a real prod cluster:** the app HelmReleases still
> carry dev-mirror values and `TODO(prod)` markers (image registries/tags,
> OIDC endpoints, ingress, persistence, ExternalSecrets). `mock-oidc` and the
> Rook dev cluster are dev-only. See `kubernetes/README.md`.
