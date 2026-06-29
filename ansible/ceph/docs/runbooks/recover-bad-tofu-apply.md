# Runbook: Recover from a Bad `tofu apply`

**When:** state corruption, drift, rendered files don't match cluster spec,
or TF destroyed an item/file that shouldn't have been touched.

**Time estimate:** 5-30 minutes depending on severity.

> **Where applies happen now:** the routine path is CI -- `.github/workflows/infra.yml`
> runs `terragrunt apply` on merge to main, with the partition's write SA
> (`OP_TF_YUCCA_<PARTITION>_ENV_WRITE`). So the bad apply you're recovering from
> is usually a failed or half-completed CI run, not a local one. CI does not
> self-heal: recovery is operator-run from a workstation, using your own
> 1Password desktop session (or, if you need the SA, the same write token CI
> uses). The commands below assume `op` is authenticated and `TF_STACK_DIR`
> points at the affected stack (default `tf/deployment/staging/austin/ceph`).

---

## Common failure modes and their fixes

### Missing or unreadable state file

```
tofu init
# Error: failed to load state: ...
```

**Cause:** S3 credentials unresolved, bucket object missing, or the backend
config differs from what the state was written with.

**Fix:**

```bash
# Verify S3 credentials resolve via op run
op run --env-file=tf/.env -- env | grep AWS_
# Expect AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY populated

# Verify the state object exists in the bucket
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3 ls s3://yucca-tf-state/yucca/staging/austin/ceph/

# If present: re-init should pick it up
mise run tf:init

# If the object is missing: state was never created or was deleted. You
# can recover by re-applying -- TF recreates the local_file resources
# (idempotent, same content). No 1P items are touched: the module's
# onepassword_item resources are dormant (see the note below).
mise run tf:apply
```

> **Dormant 1P items:** the module's `onepassword_item` resources live in
> `secrets.tf.disabled` and are not applied today -- items are created via the
> `op` CLI. They get re-enabled once a dedicated ceph-scoped service account
> replaces the org-wide superuser SA. Until then, `tofu apply` never creates
> or deletes 1P items, so re-applying state is safe.

### Rendered file on disk doesn't match tfvars

```bash
cat ansible/ceph/inventories/staging-austin/sietch/inventory.ini
# says ansible_user=root but tfvars says ansible-iac
```

**Cause:** someone hand-edited the rendered file; TF state shows it
unchanged.

**Fix:**

```bash
mise run tf:plan   # TF shows drift
mise run tf:apply  # TF overwrites with correct content
```

All TF-rendered files are gitignored -- the single source of truth is
`clusters.auto.tfvars`. Hand-edits are ephemeral.

### Wrong vault referenced in rendered secrets.yml.tpl

**Cause:** `vault` field in clusters.auto.tfvars typo'd or set to a
vault you don't have access to.

**Fix:** Fix the tfvars entry, `mise run tf:apply`. `scripts/ansible-play.sh`
will fail loudly on the next run (op inject exits non-zero on unresolvable
references -- the secrets flow fails closed: `ansible-play.sh` aborts rather
than running with empty or dummy values).

### Wordlist auto-pick renamed a deployed host

**Cause:** `name_seed` bumped, or a new auto-named host was prepended such
that existing auto-name indices shifted.

**Symptom:**

```bash
mise run tf:plan
# Plan shows: ~inventory.ini content with hostname change from <cluster>-ceph-evelyn to <cluster>-ceph-<other>
```

**Do NOT apply** -- renaming a deployed host cascades into SSH known_hosts,
cephadm host registration, certs, 1P item names, DNS.

**Fix:** pin the existing name by adding `name = "evelyn"` to the host
entry in `clusters.auto.tfvars`, then apply. The pinned name takes
precedence over the shuffle output.

### Item disappeared from the cluster vault

**Cause:** an operator, another consumer of `yucca_tf_staging`, or a TF
delete-on-destroy run removed an item the Ansible side depends on.

**Symptom:** `op inject -f -i secrets.yml.tpl` fails with "item not found".

**Fix:** re-create the item under an unlocked 1Password desktop session (your
Futo membership has write access -- no service-account token needed):

```bash
op item create \
  --vault yucca_tf_staging \
  --category password \
  --title SIETCH_CEPH_OPS_PASSWORD \
  --generate-password='letters,digits,32'
```

Then either (a) run `mise run deploy` to push the new password to the
cluster (baseline role converges ops user pw), or (b) if the cluster
already has the old value and you want to keep it, retrieve from a
backup and set the item via `op item edit password=...`.

### TF state object corrupted or lost

The state lives in S3 (`yucca-tf-state` bucket, key
`yucca/<partition>/<region>/<stack>/terraform.tfstate` -- e.g.
`yucca/staging/austin/ceph/...`). Recovery options in order of
preference:

**Option A -- roll back via S3 versioning.** The bucket has versioning
enabled; list prior versions and restore the last-known-good:

```bash
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3api list-object-versions \
      --bucket yucca-tf-state \
      --prefix yucca/staging/austin/ceph/terraform.tfstate

# Identify the VersionId of a good snapshot, then:
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3api copy-object \
      --bucket yucca-tf-state \
      --copy-source 'yucca-tf-state/yucca/staging/austin/ceph/terraform.tfstate?versionId=<VID>' \
      --key yucca/staging/austin/ceph/terraform.tfstate
```

**Option B -- re-apply from clean state.** Delete the state object and
re-init + re-apply. TF recreates the `local_file` resources (idempotent,
same content). Safe today while the 1P items stay dormant (see the note
above).

```bash
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3 rm s3://yucca-tf-state/yucca/staging/austin/ceph/terraform.tfstate

mise run tf:init
mise run tf:apply
```

Once the TF-managed 1P items land (`secrets.tf.disabled` re-enabled under
the dedicated ceph-scoped SA), Option B becomes destructive -- recovery will
require `terraform import` of each item against the new state. Document that
path when re-enabling.

## References

- `secrets.md` -- the fail-closed secrets model (TF-first, op inject)
- `tf/README.md` section "State backend" -- bucket, endpoint, key path rationale
- `architecture.md` section 4 -- what TF owns vs renders
