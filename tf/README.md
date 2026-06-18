# yucca/tf

Terraform/OpenTofu authority for cluster identity, 1P secret items, and the
inventory artifacts Ansible consumes. Multi-env via terragrunt.

## Layout

```
tf/
├── .env                              ← op:// references (committed; no literal secrets)
├── op-run.sh                         ← op-run wrapper used by the mise tf:* tasks
├── shared/
│   └── modules/
│       ├── ceph-cluster/             ← per-cluster ceph orchestration module
│       │   ├── main.tf, variables.tf, outputs.tf, rendering.tf
│       │   ├── wordlist.txt          ← 923 words for auto-picked hostnames
│       │   └── templates/
│       │       ├── inventory.ini.tftpl
│       │       ├── inventory-destroy.ini.tftpl
│       │       ├── inventory-provision-debian-live.ini.tftpl
│       │       └── secrets.yml.tpl.tftpl
│       └── talos-cluster/            ← Talos K8s VMs on the ceph hypervisors
│           ├── main.tf, variables.tf, outputs.tf
│           └── modules/
│               ├── inventory-renderer/  ← renders ansible/talos inventory + host_vars
│               └── talos-bootstrap/     ← siderolabs/talos: config apply, bootstrap, kubeconfig
└── deployment/
    ├── terragrunt.hcl                ← root: state backend, env/stack derived from path
    └── dev/
        ├── ceph/
        │   ├── terragrunt.hcl        ← include root + stack-level inputs
        │   ├── versions.tf, variables.tf, main.tf
        │   ├── clusters.auto.tfvars  ← declarative cluster list (edit here to add/modify)
        │   └── .terraform.lock.hcl
        ├── talos/
        │   ├── terragrunt.hcl, versions.tf, variables.tf, main.tf
        │   └── clusters.auto.tfvars  ← declarative Talos cluster list (nodes[], profile, VLANs)
        └── dns/
            ├── terragrunt.hcl, versions.tf, variables.tf, main.tf
            └── records.auto.tfvars   ← declarative DNS records (Cloudflare, futo.cloud zone)
```

Future envs land as siblings: `deployment/staging/ceph/`, `deployment/prod/ceph/`.
Additional stacks land as siblings within an env — `dev/talos/` and
`dev/dns/` are two; `dev/monitoring/` could be next.

The dns stack manages infrastructure names in the futo.cloud Cloudflare
zone (today: the Sietch RGW S3 endpoint + virtual-hosted wildcard).
Records are declarative in `records.auto.tfvars`; the API token resolves
from `op://yucca_tf_manual/CLOUDFLARE_API_TOKEN` via `tf/.env`.

The talos stack is documented in `ansible/talos/README.md` and
`ansible/talos/docs/runbooks/cluster-bring-up.md` (the TF + Ansible flow
is interleaved — TF renders the inventory Ansible consumes, then
bootstraps the VMs Ansible created).

## Conventions

### Env and stack are derived from the directory path

`deployment/terragrunt.hcl` parses the child's relative path to extract
`env` and `stack`:

```
deployment/dev/ceph     → env = dev,     stack = ceph
deployment/staging/ceph → env = staging, stack = ceph
deployment/prod/talos   → env = prod,    stack = talos
```

The state backend key is derived from these values:
`ceph/${env}/${stack}/terraform.tfstate` in the shared `yucca-tf-state` S3
bucket. Project-scoped so ceph state doesn't collide with o11y or future
stacks in the same bucket.

### The `op run --env-file=tf/.env --` pattern

`tf/.env` holds 1Password `op://` references — **not literal secrets**:

```sh
export OP_SERVICE_ACCOUNT_TOKEN="op://yucca_tf_dev/yucca_futo_1pass_superuser_service_account/password"
```

Wrap every terragrunt invocation with `op run --env-file=tf/.env --` (the
mise `tf:*` tasks do this automatically). The op CLI resolves the `op://`
reference and injects the actual token as `OP_SERVICE_ACCOUNT_TOKEN` into
the child process's environment. The 1P Terraform provider picks it up
from the env var and authenticates.

The same pattern is used in `immich-app/devtools` and is the Futo-wide
convention for TF secret injection.

### Committed `.env` is safe because it's just pointers

Yucca's root `.gitignore` normally excludes `.env` files — we add an
explicit `!tf/.env` exception. This file contains only `op://` URIs; no
secret ever transits the repo. It's a committed manifest of "which 1P
items this TF depends on."

### Stack override via `TF_STACK_DIR`

The default `mise run tf:*` tasks target `tf/deployment/dev/ceph`. Point
them at another stack via the `TF_STACK_DIR` env var:

```bash
TF_STACK_DIR=tf/deployment/staging/ceph mise run tf:plan
TF_STACK_DIR=tf/deployment/dev/talos    mise run tf:apply
```

## Running TF

### One-shot (preferred for now)

```bash
mise run tf:init      # first time in a stack
mise run tf:plan      # dry run
mise run tf:apply     # render artifacts + (future) create 1P items
```

These wrap: `op run --env-file=tf/.env -- terragrunt --working-dir <stack> <cmd>`.

### State backend

Remote: shared `yucca-tf-state` S3 bucket at OVH Paris
(`https://s3.eu-west-par.io.cloud.ovh.net/`). Key path:
`ceph/${env}/${stack}/terraform.tfstate` — project-scoped so ceph state
doesn't collide with o11y or future stacks in the same bucket.

Credentials are AWS-compatible env vars (`AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`), injected via `op run --env-file=tf/.env` from
the `TF_STATE_S3_*` items in the `yucca_tf` vault. OVH-specific config
(skip AWS validation, path-style URLs) is in
`deployment/terragrunt.hcl`.

**State locking is not enabled.** OVH has no DynamoDB equivalent;
OpenTofu's `use_lockfile = true` option would handle single-bucket locking
but expects the lockfile object to already exist — `terragrunt init`
against a fresh backend fails with 404 before it can create one. Enable
it once the concern is concurrent applies (multiple operators working the
same stack simultaneously). Single operator today → low risk.

## The ceph-cluster module

Declarative input in `clusters.auto.tfvars`:

```hcl
clusters = {
  sietch = {
    domain            = "dev.austin.int.futo.cloud"
    environment       = "dev"
    datacenter        = "austin"
    provider_code     = "int"
    role_in_hostname  = "ceph"
    ansible_ssh_user  = "ansible-iac"
    ansible_ssh_key   = "~/.ssh/id_ed25519_sietch"
    vault             = "yucca_tf_dev"
    provision_profile = "debian-live"   # null for Hetzner-installimage clusters
    hosts = [
      { name = "laurel", bond_ip = "10.10.10.90", bootstrap = true },
      { name = "lawson", bond_ip = "10.10.10.91" },
      { name = "samara", bond_ip = "10.10.10.92" },
    ]
  }
}
```

On apply, the module:

1. Picks wordlist names for `hosts[].name == null` (stable across applies;
   seeded per-cluster; operator-declared names excluded from the pool to
   prevent collisions).
2. Renders `inventory.ini` (normal ops), `inventory-destroy.ini` (explicit
   destroy flag), `secrets.yml.tpl` (op:// references to
   `yucca_tf_dev/<CLUSTER>_CEPH_*_PASSWORD/password`). Optionally renders
   `inventory-provision.ini` when `provision_profile != null`.
3. **(Not yet TF-managed)** `onepassword_item` resources for cluster
   secrets are dormant — items are created via `op` CLI today and read
   by Ansible at play time. See [ADR-009](../ansible/ceph/docs/adr/009-tf-first-op-inject-over-vault-password-sh.md)
   for the re-enable plan.

## Where secrets actually live

- **`yucca_tf_dev`** (team-shared): live values consumed by Ansible at
  play time. Password items per cluster (ops, dashboard, grafana, S3
  svc-user access + secret), SSH Key items per cluster (ansible-iac
  keypairs), and DR-capture items per cluster (RGW TLS cert + key,
  client.admin keyring — populated by `mise run capture`).
- **`yucca_tf_dev_manual`** (team-shared): placeholders for
  human-fillable secrets (API tokens, OAuth client secrets). Not yet used
  by ceph-cluster.

Service accounts themselves are in `yucca_tf_dev` as two items:

| SA | Purpose | Consumed by |
|---|---|---|
| `yucca_futo_1pass_superuser_service_account` | Read + write all `yucca_tf_*` vaults | TF (via `tf/.env`) |
| `yucca_futo_1pass_service_account` | Read-only on `yucca_tf` and `yucca_tf_dev` | Ansible runtime / CI |

Both are shared with other Futo consumers (o11y, base Yucca infra).
Rotation affects all of them — see `ansible/ceph/docs/runbooks/rotate-sa-token.md`
for the coordination procedure.

## Adding a new cluster

1. Add an entry to `clusters.auto.tfvars`.
2. Create the 1P items in `yucca_tf_dev`:
   - Password items: `<CLUSTER>_CEPH_{OPS,DASHBOARD,GRAFANA}_PASSWORD`, plus
     `<CLUSTER>_CEPH_S3_SVC_YUCCA_RESTIC_{ACCESS,SECRET}_KEY`. Use
     `op item create --generate-password` for each.
   - SSH Key item: `<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY` via
     `op item create --category "SSH Key" --ssh-generate-key=ed25519`.
3. `mise run tf:apply` — renders inventory + secrets template.
4. Create per-node `host_vars/*.yml` files in the new inventory dir (hardware
   topology; not TF-rendered yet).
5. On operator workstation: `scripts/install-ssh-keys.sh <cluster>` to pull
   the private key from 1P.
6. After first successful deploy: `mise run capture` to snapshot the RGW
   TLS material + admin keyring to 1P for DR.
7. See [`ansible/ceph/docs/adding-a-cluster.md`](../ansible/ceph/docs/adding-a-cluster.md)
   for the full walk-through.

## Related

- ADR-009 (TF-first + op inject): `ansible/ceph/docs/adr/009-tf-first-op-inject-over-vault-password-sh.md`
- Immich devtools (upstream pattern): <https://github.com/immich-app/devtools/tree/main/tf>
