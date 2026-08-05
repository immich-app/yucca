# Per-repository storage credentials

michael used to hold one RGW user per storage cluster — a credential that could
read and write **every** repository's bucket, sitting in the one service exposed
to the internet, whether or not anyone was backing up. It no longer holds any.

Each repository has its **own** S3 user. Its keys are sealed into the restic
token, so michael learns them only from a request that already proves the caller
owns that repository, and only for as long as that token is in play.

```
yucca-api ──creates──> RGW user yucca-repo-<repository id>   (users+buckets admin)
          ──seals────> storageCredentials claim in the restic token
                            │
restic ─────────────────────┴──> michael ──opens──> per-request S3 client
                                              (L1 cache, keyed by credential)
```

## The seal

The `storageCredentials` claim is written by `@common/server`
`sealStorageCredentials` and read by michael's `internal/credentials`:

```
base64url(version[1] || nonce[12] || ciphertext || tag[16])
```

AES-256-GCM over `{"accessKeyId","secretAccessKey"}`, with the **repository id
as additional authenticated data** — a blob lifted out of one repository's token
does not open against another's, even though both were sealed with the same key.
The format is pinned from both sides: `TestOpenTypeScriptFixture` opens a blob
the TypeScript implementation actually emitted.

Two keys, deliberately distinct:

| Key | Held by | Seals |
|---|---|---|
| `STORAGE_CREDENTIAL_KEY` | yucca-api, yucca-admin-api | the RGW secret key at rest in `repositories.storageSecretAccessKey` |
| `STORAGE_CREDENTIAL_SEAL_KEY` | the APIs **and michael** | the credentials inside a restic token |

michael can therefore open a token but not a database row. Both accept a
comma-separated list: the first key seals, every key opens, so a rotation is
`add new key everywhere` → `move it to the front on the APIs` → `drop the old
one`, with no flag day.

## Provisioning

`RepositoryService.create` provisions eagerly, so a storage cluster that cannot
issue a user fails the create rather than the first backup. `createUrl`
provisions lazily too, which is what heals a repository that predates this.

The RGW user is `yucca-repo-<repository id>`, created through the RadosGW admin
API with `max-buckets=1` — it owns exactly the one bucket backing its
repository, so a leaked key cannot stand up storage of its own. Deleting a
repository revokes its keys and leaves the bucket alone, matching the existing
behaviour that deleting a repository never deletes data.

A storage cluster with no `rgw_admin_endpoint` (the compose stack, which runs
against MinIO) falls back to `STORAGE_STATIC_ACCESS_KEY_ID` /
`STORAGE_STATIC_SECRET_ACCESS_KEY` for every repository. That exercises the
whole sealing path in dev without isolating anything — it is a development
fallback, not a deployment mode.

## michael

- The token's claim is required. There is no fallback credential, so a token
  without one is a 401 rather than a request served with someone else's keys.
- Credentials are opened once per token: the existing verified-token cache
  already keys on the `Authorization` header, so a restic session decrypts once.
- Each S3 **client** is cached per credential fingerprint per backend
  (`storage.clientCache`, 1024 entries). Every client shares its backend's
  `*http.Client`, so a new credential costs an options struct, never a
  connection pool. `storage.credentials.cache.{hits,misses}` tracks it.
- Backend health probes are **unsigned**. Any HTTP response — including the 403
  an anonymous `HeadBucket` earns — proves the gateway is serving, and only
  transport failures and 5xx mark a backend unhealthy, so probing needs no
  credential at all.

## Migrating existing repositories

Buckets created before this change belong to the old cluster-wide user, and
their objects carry that user's ACLs. `yuctl repos migrate-storage-credentials`
does, per repository:

1. `POST /repository/:id/storage-credentials` on the admin API — creates the
   repository's RGW user and keys (idempotent).
2. `PutBucketOwnershipControls` = `BucketOwnerEnforced`, signed as the **current**
   owner. RGW then ignores per-object ACLs, so the objects the old owner wrote
   follow the bucket instead of staying readable only by it.
3. Admin-API `link` of the bucket to the new user.
4. Re-read the bucket and fail loudly unless the owner actually changed.

Ordering matters: enforce ownership *before* the link, or the new owner inherits
a bucket full of objects it cannot read. `--dry-run` reports what would move;
`--repository <id>` does one; a repository already on its own user is skipped.

If an RGW rejects bucket ownership controls, the command says so and names the
fallback (`radosgw-admin bucket chown` on a ceph host) rather than half-migrating.

## Cutover

This is a hard cutover — michael has no path back to a cluster-wide credential.
Deploy the APIs and michael together, then run the migration. Tokens minted
before it carry no credentials and are rejected; on the current 1-day token
lifetime, clients re-mint within a day.

## Deleting a repository

Deleting a repository revokes its RGW user's keys and drops the row. It does
**not** delete the bucket — that has never been this codebase's behaviour, and a
WORM repository refuses deletion outright. What is left is a bucket owned by a
keyless `yucca-repo-<id>` user with no row referring to it.

Those strays are discoverable rather than automatic. `yucca-metrics-worker`
reports them every cycle as `rgw_orphaned_bucket_count` and `rgw_orphaned_bytes`,
labelled by site and cluster and recorded even at zero so the series can be
alerted on. `yuctl repos orphans` then names them, and `yuctl repos purge <id>`
reclaims one behind `--yes`, refusing anything the database still knows about. Deleting a *user* is blocked while they own any
repository, so the order is always repositories first.

## The admin identities

Two, deliberately split, both ansible-provisioned with TF-minted keys:

| User | Caps | Held by |
|---|---|---|
| `yucca-provisioner` | `users=*` | the APIs, online, in `yucca-provisioner-rgw` |
| `yucca-migrator` | `buckets=*` | operators only, read from 1Password by yuctl |

The APIs only ever call `/admin/user`, so the credential that is online
permanently has no bucket admin at all — it cannot list, stat, relink or delete
a bucket. The one that can is used by a human running a one-shot migration and
is never mounted into the cluster.

**This is a reduction, not a wall.** `users=*` can mint a key for any RGW user,
including a repository's own, and then read that bucket over the S3 data path.
RGW admin caps have no finer grain than read/write/`*` per category, so no cap
set both provisions users and forecloses that escalation. Removing it entirely
would mean no online component may create storage identities — i.e. provisioning
moves offline, or moves to short-lived STS credentials once RGW STS is enabled.
