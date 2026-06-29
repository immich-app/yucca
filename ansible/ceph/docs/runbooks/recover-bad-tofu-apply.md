# Runbook: Recover from a Bad `tofu apply`

**When:** state corruption, drift, rendered files don't match cluster spec,
or TF destroyed an item/file that shouldn't have been touched.

**Time estimate:** 5-30 minutes depending on severity.

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
      s3 ls s3://yucca-tf-state/ceph/dev/ceph/

# If present: re-init should pick it up
mise run tf:init

# If the object is missing: state was never created or was deleted. You
# can recover by re-applying — TF recreates local_file resources
# (idempotent, same content; no 1P items are harmed because the module's
# onepassword_item resources are currently dormant — see ADR-009 §2).
mise run tf:apply
```

### Rendered file on disk doesn't match tfvars

```bash
cat ansible/ceph/inventories/staging-austin/sietch/inventory.ini
# says ansible_user=root but tfvars says ansible-iac
```

**Cause:** someone hand-edited the rendered file; TF state shows it
unchanged; operator is surprised.

**Fix:**

```bash
mise run tf:plan   # TF shows drift
mise run tf:apply  # TF overwrites with correct content
```

All TF-rendered files are gitignored — the single source of truth is
`clusters.auto.tfvars`. Hand-edits are ephemeral.

### Wrong vault referenced in rendered secrets.yml.tpl

**Cause:** `vault` field in clusters.auto.tfvars typo'd or set to a
vault you don't have access to.

**Fix:** Fix the tfvars entry, `mise run tf:apply`. `scripts/ansible-play.sh`
will fail loudly on the next run (op inject exits non-zero on unresolvable
references — per ADR-009 fail-closed principle).

### Wordlist auto-pick renamed a deployed host

**Cause:** `name_seed` bumped, or a new auto-named host was prepended such
that existing auto-name indices shifted.

**Symptom:**

```bash
mise run tf:plan
# Plan shows: ~inventory.ini content with hostname change from <cluster>-ceph-evelyn to <cluster>-ceph-<other>
```

**Do NOT apply** — renaming a deployed host cascades into SSH known_hosts,
cephadm host registration, certs, 1P item names, DNS.

**Fix:** pin the existing name by adding `name = "evelyn"` to the host
entry in `clusters.auto.tfvars`, then apply. The pinned name takes
precedence over the shuffle output.

### Item disappeared from yucca_tf_dev

**Cause:** an operator, another consumer of `yucca_tf_dev`, or a TF
delete-on-destroy run removed an item the Ansible side depends on.

**Symptom:** `op inject -f -i secrets.yml.tpl` fails with "item not found".

**Fix:**

```bash
# Re-create the item manually via superuser SA
SU_TOKEN=$(op read "op://yucca_tf_dev/yucca_futo_1pass_superuser_service_account/password")
OP_SERVICE_ACCOUNT_TOKEN="$SU_TOKEN" op item create \
  --vault yucca_tf_dev \
  --category password \
  --title SIETCH_CEPH_OPS_PASSWORD \
  --generate-password='letters,digits,32'
unset SU_TOKEN
```

Then either (a) run `mise run deploy` to push the new password to the
cluster (baseline role converges ops user pw), or (b) if the cluster
already has the old value and you want to keep it, retrieve from a
backup and set the item via `op item edit password=...`.

### TF state object corrupted or lost

The state lives in S3 (`yucca-tf-state` bucket, key
`ceph/${env}/${stack}/terraform.tfstate`). Recovery options in order of
preference:

**Option A — roll back via S3 versioning.** The bucket has versioning
enabled; list prior versions and restore the last-known-good:

```bash
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3api list-object-versions \
      --bucket yucca-tf-state \
      --prefix ceph/dev/ceph/terraform.tfstate

# Identify the VersionId of a good snapshot, then:
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3api copy-object \
      --bucket yucca-tf-state \
      --copy-source 'yucca-tf-state/ceph/dev/ceph/terraform.tfstate?versionId=<VID>' \
      --key ceph/dev/ceph/terraform.tfstate
```

**Option B — re-apply from clean state.** Delete the state object and
re-init + re-apply. TF recreates the `local_file` resources (idempotent,
same content). Safe today because `onepassword_item` resources are
dormant (see ADR-009 §2).

```bash
op run --env-file=tf/.env -- \
  aws --endpoint-url=https://s3.eu-west-par.io.cloud.ovh.net/ \
      s3 rm s3://yucca-tf-state/ceph/dev/ceph/terraform.tfstate

mise run tf:init
mise run tf:apply
```

Once ADR-009 §2 ships and 1P items are TF-owned, Option B becomes
destructive — recovery will require `terraform import` of each item
against the new state. Document that path when re-enabling.

## References

- ADR-009 — fail-closed principle
- `tf/README.md` §"State backend" — bucket, endpoint, key path rationale
- `architecture.md` §4 — what TF owns vs renders
