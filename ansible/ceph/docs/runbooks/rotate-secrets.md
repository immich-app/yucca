# Runbook: Rotate Passwords and Keys

**When:** scheduled rotation, suspected compromise, or personnel change.

**Time estimate:** 5 minutes per password (plus any service-restart windows).

**Prerequisites:**
- `op` CLI authenticated (desktop session unlocked or `OP_SERVICE_ACCOUNT_TOKEN` set)
- Inventory and secrets template rendered (`tofu apply` has been run at least once)

---

## Model

1Password is the sole source of truth. Rotation = edit the item's `password`
field, done -- no re-encrypt, no commit, no sync step. The next `mise run
deploy` picks up the new value via `op inject`.

## Secrets managed by this cluster

| Secret                    | 1Password item                         | Vault          | Where it's applied                         |
|---------------------------|----------------------------------------|----------------|--------------------------------------------|
| `ops` user password       | `<CLUSTER>_CEPH_OPS_PASSWORD`          | `yucca_tf_staging` | Linux login on all nodes                   |
| Ceph dashboard password   | `<CLUSTER>_CEPH_DASHBOARD_PASSWORD`    | `yucca_tf_staging` | `https://<node>:8443` admin login          |
| Grafana admin password    | `<CLUSTER>_CEPH_GRAFANA_PASSWORD`      | `yucca_tf_staging` | `https://<node>:3000` admin login          |
| S3 service-user access    | `<CLUSTER>_CEPH_S3_SVC_YUCCA_RESTIC_ACCESS_KEY` | `yucca_tf_staging` | RGW S3 user `yucca-restic` access key       |
| S3 service-user secret    | `<CLUSTER>_CEPH_S3_SVC_YUCCA_RESTIC_SECRET_KEY` | `yucca_tf_staging` | RGW S3 user `yucca-restic` secret key       |

Replace `<CLUSTER>` with the cluster short name (e.g. `SIETCH`). The active vault name is
declared per-cluster in the `vault` field of the cluster's entry in
`tf/deployment/staging/austin/ceph/clusters.auto.tfvars` -- sietch uses
`yucca_tf_staging`; dev and prod clusters use `yucca_tf_dev` / `yucca_tf_prod`.

## 1. Rotate in 1Password

Either edit via the desktop app, or from CLI:

```bash
# Generate + set a new password in one shot
op item edit SIETCH_CEPH_DASHBOARD_PASSWORD --vault yucca_tf_staging --generate-password='letters,digits,32'
```

Or set an explicit value:

```bash
op item edit SIETCH_CEPH_DASHBOARD_PASSWORD --vault yucca_tf_staging password=<literal-new-value>
```

Verify the new value resolves:

```bash
op read "op://yucca_tf_staging/SIETCH_CEPH_DASHBOARD_PASSWORD/password" | wc -c
```

## 2. Apply to the cluster

### ops user password

The baseline role converges the ops user password on every run:

```bash
scripts/ansible-play.sh baseline.yml --tags users
```

The old password stops working immediately.

### Dashboard password

Not re-applied by normal deploys. Set directly on the bootstrap MON:

```bash
ssh ansible-iac@sietch-ceph-laurel \
  sudo ceph dashboard ac-user-set-password admin \
  "$(op read 'op://yucca_tf_staging/SIETCH_CEPH_DASHBOARD_PASSWORD/password')"
```

Expect `User admin updated`.

### Grafana admin password

Re-run the monitoring tag:

```bash
scripts/ansible-play.sh deploy-ceph.yml --tags monitoring
```

## 3. Verify

| Check | Command / action |
|---|---|
| ops login | `ssh ops@sietch-ceph-laurel` -- new password prompts and works |
| Dashboard | browse `https://<bootstrap-ip>:8443`, log in as `admin` with new password |
| Grafana | browse `https://<bootstrap-ip>:3000`, log in as `admin` with new password |

## 4. Clean up

No cleanup needed on the secrets side -- old values are gone from 1Password
the moment you save the new ones. No vault.yml re-encryption, no git commit
required for rotation.

---

## Rotating SSH keys

SSH keys for `ansible-iac` live in `yucca_tf_staging` as category `SSH Key`
items titled `<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY`. Rotation is
forward-only -- generate a new key in 1P, distribute the new pubkey,
retire the old key once you have confirmed the new one works.

### Steps (sietch example; same pattern for any cluster)

1. **Generate the new keypair natively in 1P**. The current item must be
   replaced (1P doesn't support multiple key versions per item).
   Snapshot the old item first for rollback:

   ```bash
   # Under an unlocked 1Password desktop session (Futo membership = write):

   # Save the old item as a dated rollback copy (private_key is derivable
   # via op item get; use --reveal if you need it on disk)
   op item edit SIETCH_CEPH_ANSIBLE_IAC_SSH_KEY \
     --vault yucca_tf_staging \
     --title "SIETCH_CEPH_ANSIBLE_IAC_SSH_KEY_RETIRED_$(date +%Y%m%d)"

   # Create the replacement with the canonical title
   op item create \
     --vault yucca_tf_staging --category "SSH Key" \
     --title SIETCH_CEPH_ANSIBLE_IAC_SSH_KEY \
     --ssh-generate-key=ed25519
   ```

2. **Install the new private key on your workstation**
   (`scripts/install-ssh-keys.sh` refuses to overwrite mismatched
   fingerprints -- move the old file aside first):

   ```bash
   mv ~/.ssh/id_ed25519_sietch ~/.ssh/id_ed25519_sietch.retired-$(date +%Y%m%d)
   mv ~/.ssh/id_ed25519_sietch.pub ~/.ssh/id_ed25519_sietch.pub.retired-$(date +%Y%m%d)
   scripts/install-ssh-keys.sh sietch
   ```

3. **Distribute the new pubkey to every node** (non-destructive;
   old key stays in authorized_keys until step 5):

   ```bash
   scripts/ansible-play.sh rotate-ssh-key.yml
   ```

4. **Test** SSH with the new key:

   ```bash
   ssh -i ~/.ssh/id_ed25519_sietch ansible-iac@sietch-ceph-laurel hostname -f
   ```

5. **Remove the old key from authorized_keys** once confident (manual
   -- no playbook for this yet). On each node:

   ```bash
   ssh ansible-iac@sietch-ceph-laurel \
     "sed -i '/RETIRED-KEY-COMMENT/d' ~/.ssh/authorized_keys"
   ```

   Match by key comment (e.g., the email/hostname in the pubkey's
   trailing field).

6. **Delete the retired 1P item** (optional; keep ~30 days for
   audit/rollback):

   ```bash
   op item delete \
     --vault yucca_tf_staging "SIETCH_CEPH_ANSIBLE_IAC_SSH_KEY_RETIRED_<date>"
   ```

### Provisioning a fresh host uses the current key

`roles/provision_host/tasks/admin_user.yml` reads
`{{ provision_iac_ssh_key_path }}.pub` (e.g., `~/.ssh/id_ed25519_sietch.pub`
on operator disk) and installs it as the bootstrap `authorized_keys`
during Debian live-image provisioning. Make sure `install-ssh-keys.sh`
has run on any workstation that'll drive provisioning.

---

## Future: rotating TF-provisioned secrets

Once the sietch-ceph service account lands and `secrets.tf.disabled` is
re-enabled, rotations become a `terraform taint` + `apply`:

```bash
cd tf/deployment/staging/austin/ceph
terragrunt taint 'module.cluster["sietch"].onepassword_item.secret["dashboard"]'
terragrunt apply
```

This regenerates the password in 1Password; the apply step to the live
cluster (dashboard / grafana commands above) is still required.

## Cluster-minted identities (not in 1Password)

### monk scrub-exporter key (`client.scrub-exporter`)

A cephx identity minted on the cluster itself (caps `mon allow r, mgr allow
r`), staged onto each mon host by `roles/scrub_exporter`. To rotate: `ceph
auth del client.scrub-exporter` on the bootstrap node, then re-run `mise run
monk` -- `get-or-create` mints a fresh key and the role restages the keyring
and restarts every mon's unit. Read-only: compromise exposes cluster
metadata reads, not object data (see `docs/security-model.md`).
