# Adding a cluster

Clusters are declared in `tf/deployment/<partition>/<region>/ceph/clusters.auto.tfvars`.
Every cluster-scoped concern — inventory file, hostname, 1P item names, SSH
key path, secrets template — is derived from that one entry. Most of what
this walkthrough describes is editing that file and running
`mise run tf:apply`; the rest is creating the 1P items TF expects to read
at playbook time.

For the broader architecture see [docs/architecture.md](architecture.md); for
the per-item secrets catalog see [docs/secrets.md](secrets.md); for the
naming rules see [docs/naming.md](naming.md).

## What TF does vs. what you do

| TF (`mise run tf:apply`)                                                | You (one-time per cluster)                                         |
|-------------------------------------------------------------------------|---------------------------------------------------------------------|
| Renders `inventory.ini`, `inventory-destroy.ini`, `secrets.yml.tpl`     | Create `group_vars/all/vars.yml` (cluster-wide Ansible config)     |
| Renders `inventory-provision-<profile>.ini` when `provision_profile` set | Create one `host_vars/<hostname>.yml` per node (hardware topology) |
| Picks auto-names from the wordlist for hosts where `name = null`        | Create 1P items: passwords, SSH keypair                            |
| Computes hostnames, FQDNs, 1P item titles, inventory directory path     | Run `scripts/install-ssh-keys.sh <cluster>` on your workstation    |
| (Future) Creates `onepassword_item` resources for passwords             | Run `mise run preflight` + `mise run deploy`                       |

Every operator doing a cluster add follows the same steps — nothing in
this walkthrough is machine- or operator-specific.

## Inventory directory naming

```
inventories/<partition>-<region>/<cluster>/
```

The `<partition>-<region>` slug (e.g. `staging-austin`) groups every cluster
in a region under one tree; the cluster's role lives only in the hostname,
not the inventory path.

Existing examples:
- `staging-austin/sietch/` — Austin DC, internal network, staging

Future regions land as siblings: `prod-htz-fsn1/<cluster>/`,
`dev-local/<cluster>/`.

## Step-by-step

### 1. Choose a cluster name

The engineer adding the cluster picks the name. Conventions and constraints
live in [docs/naming.md](naming.md#cluster-naming). Quick summary:

- **Convention:** Dune-themed (existing: `sietch`). Not enforced.
- **Constraints:** lowercase, short (6–10 chars ideal), no dashes or dots,
  unique within the `yucca_tf_*` item namespace, not already a key in
  `clusters.auto.tfvars`.
- **Cost of renaming later:** expensive (touches hostnames, 1P items,
  cephadm identity, SSH keys, DNS). Pick deliberately.

Host names within a cluster can be operator-declared in the TFvars or
auto-picked from the 923-word wordlist — see [docs/naming.md](naming.md#host-naming).

### 2. Declare the cluster in TF

Edit `tf/deployment/<partition>/<region>/ceph/clusters.auto.tfvars` and add an entry.
Working example for a hypothetical `mesa` cluster at Hetzner Falkenstein:

```hcl
clusters = {
  sietch  = { ... }

  mesa = {
    domain            = "dev.fsn.htz.futo.cloud"
    environment       = "dev"
    datacenter        = "fsn"
    provider_code     = "htz"
    role_in_hostname  = "ceph"
    ansible_ssh_user  = "ansible-iac"        # Hetzner installimage boots as root;
                                             # baseline creates ansible-iac before first deploy
    ansible_ssh_key   = "~/.ssh/id_ed25519_mesa"
    vault             = "yucca_tf_dev"       # or yucca_tf_staging / yucca_tf_prod
    provision_profile = null                 # Hetzner installimage; no debian-live provisioning
    hosts = [
      { bond_ip = "<public-ip>", bootstrap = true },   # name auto-picked from wordlist
    ]
  }
}
```

Notes:

- `vault` declares which 1Password vault TF rendering will write into the
  `secrets.yml.tpl`. `yucca_tf_dev` for dev clusters, `yucca_tf_staging`
  or `yucca_tf` (prod) for their respective environments.
- `provision_profile = "debian-live"` enables bare-metal provisioning via
  `provision.yml` (rendered `inventory-provision.ini`). Leave null for
  Hetzner installimage workflows — the post-install script uses its own
  path (`inventories/<cluster>/installimage/post-install.sh.tpl`).
- Host `name = null` (omitted) → TF picks a stable wordlist name seeded
  per-cluster. Auto-picks don't change on subsequent applies.

### 3. Render the inventory + secrets template

```bash
mise run tf:apply
```

Or, for a non-default stack:

```bash
TF_STACK_DIR=tf/deployment/<partition>/<region>/ceph mise run tf:apply
```

This creates (per the module's `rendering.tf`):

- `ansible/ceph/inventories/<partition>-<region>/<cluster>/inventory.ini`
- `.../inventory-destroy.ini`
- `.../secrets.yml.tpl`
- `.../inventory-provision-<profile>.ini` (only when `provision_profile` is set)

All of these are gitignored — re-run `mise run tf:apply` after any
`clusters.auto.tfvars` change.

### 4. Create `group_vars/all/vars.yml`

Hand-maintained, committed. Copy the closer existing analogue as a starting
point:

- **Bare-metal cluster:** copy from `staging-austin/sietch/group_vars/all/vars.yml`
- **Hetzner/single-NIC cluster:** start from the sietch vars and adjust for
  the NVMe-RAID shape (public /32, no bond/ProxyJump, installimage-owned LVM).

```bash
cp inventories/staging-austin/sietch/group_vars/all/vars.yml \
   inventories/mesa-ceph.dev.fsn.htz/group_vars/all/vars.yml
```

Edit every value. Required shape:

```yaml
---
# === Naming ===
cluster_name: mesa
cluster_role: ceph
cluster_domain: dev.fsn.htz.futo.cloud

# === Network ===
public_network: <subnet or public /32>
cluster_network: <same as public for single-network topology>
# Bonds / gateway / DNS — omit or customize per hardware

# === Ceph ===
ceph_release: tentacle
ceph_repo_url: "https://download.ceph.com/debian-{{ ceph_release }}/"
ceph_repo_key_url: "https://download.ceph.com/keys/release.asc"

# === OS Provisioning ===
admin_user: ansible-iac
timezone: UTC
# Used by provision.yml's post-reboot SSH verification to read the marker.
provision_iac_ssh_key_path: "~/.ssh/id_ed25519_mesa"

# === Secret aliases (populated by op inject at playbook time) ===
# These map TF-rendered vault_* names into the role-facing names the
# playbooks consume. Add one alias per secret declared in the module's
# secrets map (tf/shared/modules/ceph-cluster/main.tf).
ops_password: "{{ vault_ops_password }}"
ceph_dashboard_user: admin
ceph_dashboard_password: "{{ vault_ceph_dashboard_password }}"
ceph_grafana_admin_user: admin
ceph_grafana_admin_password: "{{ vault_grafana_admin_password }}"
ceph_rgw_s3_user_access_key: "{{ vault_s3_restic_access_key }}"
ceph_rgw_s3_user_secret_key: "{{ vault_s3_restic_secret_key }}"

# === RGW ===
ceph_rgw_realm: <cluster-name>
ceph_rgw_zonegroup: <zonegroup>
ceph_rgw_zone: <zone>

# === Storage ===
ssd_model_pattern: "Micron_5100"      # match your SSD model
# ... (see the cluster you copied from for full hardware config)
```

### 5. Create `host_vars/<hostname>.yml` per node

Host files are committed (per-cluster hardware topology is stable inventory
truth — not operator preference). Use `<cluster>/host_vars/example.yml` as
a template.

```bash
CLUSTER_DIR=inventories/mesa-ceph.dev.fsn.htz
# Look up the hostname TF picked (or declared) — visible in the rendered inventory.ini
TF_OUTPUT=$(cat "$CLUSTER_DIR/inventory.ini")
# Create one host_vars file per hostname_short shown in the [ceph_nodes] section
cp "$CLUSTER_DIR/host_vars/example.yml" "$CLUSTER_DIR/host_vars/<hostname_short>.yml"
```

Edit with node-specific hardware facts: `bond_ip`, SAS expander path
prefix, SSD PHY positions, HDD-to-block.db-LV mappings. See
[docs/hardware.md](hardware.md) for the shape.

Operator-local overrides (e.g., testing a workaround on one node) can go
in `<hostname_short>.local.yml` — that suffix is gitignored.

### 6. Create 1Password items

For the target vault declared in the cluster's TFvars entry:

```bash
VAULT=yucca_tf_dev     # match the vault field in clusters.auto.tfvars
CLUSTER=MESA           # uppercase cluster_name

# Password items — 3 ending in _PASSWORD
for role in OPS DASHBOARD GRAFANA; do
  op item create --vault "$VAULT" --category password \
    --title "${CLUSTER}_CEPH_${role}_PASSWORD" \
    --generate-password='letters,digits,32'
done

# S3 service-user keys — 2 items; names already end in _KEY
for suffix in S3_SVC_YUCCA_RESTIC_ACCESS_KEY S3_SVC_YUCCA_RESTIC_SECRET_KEY; do
  op item create --vault "$VAULT" --category password \
    --title "${CLUSTER}_CEPH_${suffix}" \
    --generate-password='letters,digits,32'
done

# SSH Key item — one keypair per cluster. op CLI GENERATES the key inside 1P;
# the private key never touches operator disk at creation.
op item create --vault "$VAULT" \
  --category "SSH Key" \
  --title "${CLUSTER}_CEPH_ANSIBLE_IAC_SSH_KEY" \
  --ssh-generate-key=ed25519
```

Verify the TF-rendered template resolves:

```bash
CEPH_ENV=inventories/mesa-ceph.dev.fsn.htz/inventory.ini
op inject -f -i "$(dirname $CEPH_ENV)/secrets.yml.tpl" -o /tmp/test-secrets.yml
head -5 /tmp/test-secrets.yml && rm /tmp/test-secrets.yml
```

Disaster-recovery items (`<CLUSTER>_CEPH_RGW_TLS_CERT`, `_RGW_TLS_KEY`,
`_CLIENT_ADMIN_KEYRING`) are **not** created here — they're populated by
`mise run capture` after the first successful deploy. Skipping that step
is the most common gotcha.

### 7. Install the SSH keypair on your workstation

```bash
scripts/install-ssh-keys.sh mesa
```

The wrapper reads `private_key` and `public_key` from
`${CLUSTER}_CEPH_ANSIBLE_IAC_SSH_KEY` and writes `~/.ssh/id_ed25519_mesa`
(0600) + `.pub` (0644). Idempotent — re-running is safe. Every operator
who will run plays against this cluster runs this command once on their
workstation (or any time they wipe `~/.ssh/`).

The `ansible_ssh_key` path in `clusters.auto.tfvars` must match what
`install-ssh-keys.sh` writes. If you chose a non-default filename,
update both together (or update the mapping in `install-ssh-keys.sh`).

See [docs/scripts.md](scripts.md#install-ssh-keyssh) for the script
reference and [secrets.md](secrets.md) for the SSH-key storage model.

### 8. Preflight

```bash
CEPH_ENV=inventories/mesa-ceph.dev.fsn.htz/inventory.ini mise run preflight
```

(Inline-prefix form — `export CEPH_ENV=...` then `mise run preflight`
does NOT work; mise's `[env]` block strips shell exports. See
[docs/scripts.md "Setting CEPH_ENV"](scripts.md).)

Verifies: TF artifacts present, 1P session live, `op inject` resolves
the template, SSH reachable, Python 3 on targets.

### 9. Deploy

For Hetzner installimage clusters, run the installimage flow first
(out-of-band: reboot into rescue mode, run `installimage/autosetup` plus
the op-injected `post-install.sh`). For Austin bare-metal clusters, run `provision.yml`
first (boot into the live image, then `scripts/ansible-play.sh
provision.yml -e confirm_wipe=true` with
`CEPH_ENV=.../inventory-provision.ini`). Then:

```bash
mise run deploy
```

Every task invocation goes through `scripts/ansible-play.sh`, which
`op inject`s the secrets template into a short-lived tmpfile and passes
it as `--extra-vars @<tmpfile>`.

### 10. Capture the DR belt-and-suspenders items

After the first successful deploy:

```bash
mise run capture
```

This reads `/etc/ceph/rgw-ssl.crt`, `/etc/ceph/rgw-ssl.key`, and
`/etc/ceph/ceph.client.admin.keyring` from the bootstrap node and upserts
them as Document items in the cluster's vault
(`<CLUSTER>_CEPH_RGW_TLS_CERT`, `_RGW_TLS_KEY`, `_CLIENT_ADMIN_KEYRING`). Safe
to re-run — updates in place on content drift.

## How `CEPH_ENV` works

`CEPH_ENV` points to the inventory file, not the directory:

```bash
# Correct
CEPH_ENV=inventories/mesa-ceph.dev.fsn.htz/inventory.ini

# Wrong — directory mode loads every .ini including destroy inventory
CEPH_ENV=inventories/mesa-ceph.dev.fsn.htz/
```

Default is set in `.mise.toml` (`sietch` in dev). Override per-command:

```bash
CEPH_ENV=inventories/staging-austin/sietch/inventory.ini mise run status
```

`scripts/ansible-play.sh` derives the secrets template path from `CEPH_ENV`
(same directory, `secrets.yml.tpl`).

## What lives where in the repo

| Committed                                            | Gitignored (TF-rendered or operator-local) |
|------------------------------------------------------|--------------------------------------------|
| `clusters.auto.tfvars`                               | `inventories/*/inventory.ini`              |
| `inventories/<cluster>/group_vars/all/vars.yml`      | `inventories/*/inventory-provision.ini`    |
| `inventories/<cluster>/host_vars/<hostname>.yml`     | `inventories/*/inventory-destroy.ini`      |
| `inventories/<cluster>/installimage/*.tpl`           | `inventories/*/secrets.yml.tpl`            |
|                                                      | `inventories/*/host_vars/*.local.yml`      |
|                                                      | `inventories/*/installimage/post-install.sh` |

No secrets are ever committed. The `.tpl` file contains `op://` references
only; `op inject` resolves them at play time into a 0600 tmpfile that's
trap-cleaned on exit.

## Common gotchas

- **Forgot step 10 (`mise run capture`)** — DR items are missing in 1P.
  Running `capture` after the fact works; it just needs the bootstrap
  node's filesystem intact.
- **`ansible_ssh_key` path mismatch** between `clusters.auto.tfvars` and
  `install-ssh-keys.sh` — key installed under a different name than what
  the inventory expects. Keep them aligned.
- **Fingerprint mismatch on `install-ssh-keys.sh`** — happens after a
  key rotation if you haven't moved the old key aside. Follow the
  `mv ~/.ssh/id_ed25519_<cluster>{,.$(date +%Y%m%d).bak}` path in the
  wrapper's error message.
- **`host_vars/` out of date after `tofu apply` re-picks a wordlist
  name** — auto-names are stable across applies, but if you add hosts
  at positions other than the tail, shuffled names may shift. Add new
  hosts at the end of the `hosts = [...]` list to keep existing
  hostnames stable.
- **Painbox-style Hetzner clusters and `provision_profile`** — leave
  `provision_profile = null` so TF doesn't render the debian-live
  inventory. The Hetzner installimage flow has its own post-install
  script under `installimage/`, not Ansible-driven.

## See also

- [architecture.md §4 (Terraform)](architecture.md) — what TF owns
- [secrets.md](secrets.md) — per-item catalog + vault selection
- [naming.md](naming.md) — cluster + host naming conventions
- [hardware.md](hardware.md) — `host_vars/` shape, network topology
- [scripts.md](scripts.md) — wrapper reference
- [architecture.md](architecture.md) — why TF is authoritative for cluster identity + secrets
- [secrets.md](secrets.md) — why passwords and SSH keys live in 1P
