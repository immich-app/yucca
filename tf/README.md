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
│       ├── talos-cluster/            ← Talos K8s VMs on the ceph hypervisors
│       │   ├── main.tf, variables.tf, outputs.tf
│       │   └── modules/
│       │       ├── inventory-renderer/  ← renders ansible/talos inventory + host_vars
│       │       └── talos-bootstrap/     ← siderolabs/talos: config apply, bootstrap, kubeconfig
│       └── talos-baremetal/         ← Talos on bare-metal nodes already in maintenance mode
│           ├── main.tf, variables.tf, outputs.tf
│           └── firewall.tf              ← Talos host ingress firewall (default-deny + allow-lists)
└── deployment/
    ├── terragrunt.hcl                ← root: state backend, env/stack derived from path
    ├── dev/
    │   ├── ceph/
    │   │   ├── terragrunt.hcl        ← include root + stack-level inputs
    │   │   ├── versions.tf, variables.tf, main.tf
    │   │   ├── clusters.auto.tfvars  ← declarative cluster list (edit here to add/modify)
    │   │   └── .terraform.lock.hcl
    │   ├── talos/
    │   │   ├── terragrunt.hcl, versions.tf, variables.tf, main.tf
    │   │   └── clusters.auto.tfvars  ← declarative Talos cluster list (nodes[], profile, VLANs)
    │   └── dns/
    │       ├── terragrunt.hcl, versions.tf, variables.tf, main.tf
    │       └── records.auto.tfvars   ← declarative DNS records (Cloudflare, futo.cloud zone)
    └── staging/
        └── talos/                    ← bare-metal Talos cluster (3× CP, Cilium CNI)
            ├── terragrunt.hcl, versions.tf, variables.tf, main.tf, providers.tf
            ├── helm.tf               ← Cilium install + post-CNI health gate
            ├── cilium-values.yaml.tftpl
            └── clusters.auto.tfvars  ← declarative node list (nodes[], bond, VIP, firewall)
```

Future envs land as siblings: `deployment/staging/ceph/`, `deployment/prod/ceph/`.
Additional stacks land as siblings within an env — `dev/talos/` and
`dev/dns/` are two; `dev/monitoring/` could be next. NetBird Cloud access
control lives in `staging/netbird/` (flat), and for prod is layered:
`prod/global/` (account-wide) above per-site `prod/<site>/netbird/`
(e.g. `prod/htz-fsn1/netbird/`). See "The netbird-env module" below.

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

The default `mise run tf:*` tasks target `tf/deployment/staging/ceph`. Point
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

### In CI (staging stacks)

`.github/workflows/infra.yml` runs the staging stacks from GitHub Actions:

- **Plan** on every PR touching `tf/**`; **apply** on merge to `main`, gated
  behind the `staging-infra` Environment (required reviewers).
- Applies `staging/talos` (cluster + Flux + secrets) then `staging/dns`.
- The Talos stack reaches the `10.10.10.0/24` nodes by joining the **tailnet**
  (`tailscale/github-action`, `--accept-routes`) — the cluster firewall already
  trusts the Tailscale CIDRs. The DNS stack is pure Cloudflare API, no tailnet.
- Secrets come from the same `op run --env-file=tf/.env` path; CI just supplies
  the per-env 1P service-account token (the rest resolves from 1P). The token is
  injected as `OP_SERVICE_ACCOUNT_TOKEN` from the environment-specific secret —
  `OP_TF_YUCCA_STAGING_ENV` here (dev/prod workflows use `OP_TF_YUCCA_DEV_ENV` /
  `OP_TF_YUCCA_PROD_ENV`) — replacing a shared superuser SA with a scoped one.

Prerequisites (out-of-band): repo secret `OP_TF_YUCCA_STAGING_ENV` — a **staging**
1P service account mirroring the dev/prod ones, i.e. granted `shared_tf`,
`shared_tf_staging`, `yucca_tf` (read) + `yucca_tf_staging` (read/write for the
JWT-keypair item). Note: a copy of the *dev* SA token won't work — it can't read
`yucca_tf_staging`. Also: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`; a Tailscale
subnet router advertising `10.10.10.0/24` with `tag:project-yucca` approved for
it; and the `staging-infra` Environment with required reviewers.

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

## The talos-baremetal module (staging/talos)

Brings up Talos on **bare-metal nodes already running in maintenance mode** at
known addresses — no Ansible, no hypervisors, no VLANs (contrast the VM-oriented
`talos-cluster` module). It dials each node's maintenance IP, applies machine
config (which installs to disk + reboots), bootstraps one CP, then emits
kube/talosconfig and gates on cluster health.

Declarative input in `deployment/staging/talos/clusters.auto.tfvars`:

```hcl
clusters = {
  yucca-staging = {
    talos_version      = "1.13.4"
    kubernetes_version = "v1.36.1"
    install_disk       = "/dev/sda"        # WIPED — the 240GB DELLBOSS; NVMe left raw
    cluster_vip        = "10.10.10.15"     # L2 VIP, etcd-elected across CPs
    gateway            = "10.10.10.1"
    subnet_cidr        = "10.10.10.0/24"
    cni                = "cilium"           # cni:none in Talos + Cilium via Helm
    disable_kube_proxy = true               # Cilium kube-proxy replacement (KubePrism)
    cilium_version     = "1.19.5"
    hubble             = true
    bond = { interfaces = ["eno1np0", "eno2np1"], mode = "active-backup" } # flip to 802.3ad after the switch is LACP'd
    nodes = [
      { name = "staging-cp1", address = "10.10.10.47" },
      { name = "staging-cp2", address = "10.10.10.242" },
      { name = "staging-cp3", address = "10.10.10.117" },
    ]
  }
}
```

Notes:

- **Static IP = maintenance IP.** Each node's `address` is pinned as the static
  IP on `bond0`, so TF stays reachable across the install reboot.
- **bond** comes up `active-backup` (no switch config needed). Migrate to
  `802.3ad` later, node-by-node, after converting the switch ports to LACP
  port-channels — LACP needs both ends configured at once, so a big-bang flip
  drops connectivity until both sides agree.
- **Ingress firewall** (`firewall.tf`): default-deny + per-service allow-lists
  scoped to the subnet (+ pod CIDR on kubelet). apid + apiserver also trust the
  Tailscale ranges (`trust_tailscale`). ⚠️ The host running `tf apply` must have
  a source IP inside an allowed range or apid (50000) is blocked and bootstrap
  hangs — add operator/jump subnets to `trusted_cidrs`.
- **CNI is installed in the same apply.** With `cni:none` the nodes are NotReady
  until Cilium lands, so the module's health gate runs `skip_kubernetes_checks`;
  `helm.tf` installs Cilium, then a second (full) health gate enforces Ready.
- **One cluster per stack.** The helm provider binds to a single cluster
  (`one(...)`); add more clusters in their own stack.

Run it (see "Running TF" below — needs 1Password unlocked + an on-LAN apply host):

```bash
TF_STACK_DIR=tf/deployment/staging/talos mise run tf:init
TF_STACK_DIR=tf/deployment/staging/talos mise run tf:plan
TF_STACK_DIR=tf/deployment/staging/talos mise run tf:apply   # WIPES /dev/sda, installs Talos
```

## The netbird-env module (NetBird Cloud access control)

Manages one layer's [NetBird](https://netbird.io) Cloud footprint: **groups**,
**access policies**, **device auth (setup) keys**, and routed **networks**. One
NetBird Cloud account (`api.netbird.io`) backs everything — the module namespaces
every object `<name_prefix>_<key>` (all underscores) so all envs/sites coexist.

### Group model

Per env (and per prod site), the baseline groups are:

| group | who | rendered (staging / prod htz-fsn1) |
|---|---|---|
| `ci` | ephemeral CI runners | `yucca_staging_ci` / `yucca_prod_htz_fsn1_ci` |
| `mgmt` | management nodes (configured via Ansible; also the route peers) | `yucca_staging_mgmt` / … |
| `talos` | Talos cluster nodes | `yucca_staging_talos` / … |
| `k8s_operator` | in-cluster kubernetes operator | `yucca_staging_k8s_operator` / … |

CI is **per-env** (`yucca_<env>_ci`, reaching only that env's groups) — no
cross-env CI plane. `k8s` is split into `talos` (the nodes) and `k8s_operator`
(the operator identity) so they can carry different policies.

### Stacks & layering

| stack | env / scope | state key |
|---|---|---|
| `deployment/staging/netbird` | staging (flat) | `ceph/staging/netbird/…` |
| `deployment/prod/global` | prod, **account-wide** (cross-site) | `ceph/prod/global/…` |
| `deployment/prod/htz-fsn1/netbird` | prod, **site** htz-fsn1 | `ceph/prod/htz-fsn1/netbird/…` |

Staging is single-layer. **Prod is layered**: a `global` layer (account-wide
groups + policies) above per-site layers. The global layer owns the
**`yucca_resource`** tag group and the account-wide **`yucca → yucca_resource`**
policy (see below). Site groups are site-scoped (`yucca_prod_<site>_<role>`) so a
network router's peers are unambiguously *that site's* mgmt nodes. A site layer
consumes a global group via a terragrunt `dependency` on `prod/global` → the
module's `external_groups` input (htz-fsn1 does this for `yucca_resource`). The
root terragrunt derives `stack` from the full sub-path, so `prod/htz-fsn1/netbird`
gets its own state key without colliding with the `prod/htz-fsn1` fabric stack.

### The `yucca` / `yucca_resource` access model

Two pre-existing-or-managed groups drive account-wide access to routed subnets:

- **`yucca`** — the existing **users** group (people). External (looked up by
  name); never managed here.
- **`yucca_resource`** — the shared **resource tag**, managed in `prod/global`.
  Every routed `netbird_network_resource` (across sites) is tagged into it.

One global policy in `prod/global` — `yucca → yucca_resource`, `bidirectional =
false` — lets users reach every tagged resource. Because `yucca_resource` is only
ever a policy *destination*, the tagged resources can't reach each other (or call
back to users). Site layers don't reference `yucca` at all; they just tag their
resources into `yucca_resource` (pulled from `prod/global` via the dependency),
so the link is the shared tag, not a cross-stack group reference.

Staging additionally grants its `ci` group access to the existing **Liberty
Park** infra groups (where the staging nodes live today) — those are external
groups resolved by name in `staging/netbird/main.tf`.

### Declarative input (`netbird.auto.tfvars`)

Groups, setup keys, policies and networks reference groups by **logical key**,
never opaque NetBird IDs:

```hcl
groups = { ci = {}, mgmt = {}, talos = {}, k8s_operator = {} }

setup_keys = {
  ci           = { type = "reusable", ephemeral = true, auto_groups = ["ci"] }
  mgmt         = { type = "reusable", auto_groups = ["mgmt"] }
  talos        = { type = "reusable", auto_groups = ["talos"] }
  k8s_operator = { type = "reusable", auto_groups = ["k8s_operator"] }
}

policies = {
  ci-to-all = {                       # CI reaches every node group in this env
    rules = [{ name = "ci-to-all", protocol = "all"
               sources = ["ci"], destinations = ["mgmt", "talos", "k8s_operator"] }]
  }
}
```

NetBird is **default-deny** — a peer gets only the access its groups' policies
grant; an empty `policies` map means total isolation.

### Networks (prod htz-fsn1) — CIDRs propagated, not hardcoded

The htz-fsn1 site layer exposes a NetBird **Network** named `HTZ-FSN1`: the
`mgmt` group are the routing peers, and each routed subnet is a
`netbird_network_resource`. The **CIDRs are derived from the same
`fabric-addressing` module the fabric stack uses** (re-instantiated in the
layer's `addressing.tf` — a pure, stateless module, so no duplication and no
cross-stack coupling). Every resource is tagged into `yucca_resource`, so access
is the one global `yucca → yucca_resource` policy. The only per-site input is the
site id (the CIDRs flow from it):

```hcl
site_id = 40   # mirrors prod/htz-fsn1; feeds fabric-addressing → the routed CIDRs
               #   mgmt 10.40.5.0/24 · api 10.40.10.0/24
               #   cls1_public 10.40.20.0/23 · cls1_private 10.40.22.0/23
```

**Setup-key plaintext → 1Password.** Each setup key's secret `key` is written to
the per-env vault (`yucca_tf_<env>`) as item
`NETBIRD_<UPPERCASED_NAMESPACED_NAME>_SETUP_KEY` (`onepassword_item`, same "TF
mints secrets into 1P" pattern as the JWT keypair). The namespaced title keeps
multiple prod sites writing to the one `yucca_tf_prod` vault from colliding.

**Auth.** Two providers, both fed by `op run --env-file=tf/.env[.prod]`:

- `netbird` — admin PAT from `NB_PAT` (`op://shared_tf/NETBIRD_TF_PAT`, shared
  across all envs; `management_url` defaults to NetBird Cloud).
- `onepassword` — `OP_SERVICE_ACCOUNT_TOKEN` (same session), writes the keys.

Run it (pure cloud API — no tailnet, no node contact):

```bash
TF_STACK_DIR=tf/deployment/staging/netbird mise run tf:init   # then tf:plan / tf:apply
# prod — global layer first, then each site layer (uses the prod env file + SA):
OP_ENV_FILE=tf/.env.prod TF_STACK_DIR=tf/deployment/prod/global         mise run tf:apply
OP_ENV_FILE=tf/.env.prod TF_STACK_DIR=tf/deployment/prod/htz-fsn1/netbird mise run tf:apply
```

CI (`.github/workflows/infra.yml`) applies `staging/netbird` in the staging
matrix, and the prod layers (`prod/global` then `prod/htz-fsn1/netbird`) as gated
`prod-infra` jobs on the prod 1P SA / `tf/.env.prod`. Prod CI needs the
`OP_TF_YUCCA_PROD_ENV[_WRITE]` repo secrets + a `prod-infra` Environment — see
the workflow header.

### CI connects over NetBird

CI reaches the staging `10.10.10.0/24` nodes over the NetBird overlay (this
replaced the Tailscale subnet-router path). The `.github/actions/netbird-connect`
composite action installs the client and runs `netbird up` with the **`ci` setup
key** read from 1P (`op://yucca_tf_staging/NETBIRD_YUCCA_STAGING_CI_SETUP_KEY`);
the runner joins as a `ci` peer and the existing staging route advertises the LAN.
The apply job applies `staging/netbird` **first** (minting that key) before
connecting, so a fresh bootstrap is self-contained. The prod **fabric** workflow
(`fabric.yml`) still uses Tailscale — `10.40.5.0/24` isn't on NetBird yet.

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
