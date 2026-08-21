# Restic client retry behavior

What the restic client does when michael returns an error. Michael's own
resilience mechanisms (the S3 backend pool, its retries and circuit breakers)
are designed around this contract, so status-code decisions in
`packages/michael` should be checked against this document — and this document
against restic's source when it moves.

Sourced from restic `internal/backend/retry/backend_retry.go` and
`internal/backend/rest/rest.go` as of August 2026 (restic ≥ 0.17 semantics; the
`backend-error-redesign` feature flag is Beta and therefore **on by default**).

## The retry envelope

Every backend operation (Load, Save, Stat, Remove, List) is wrapped in a retry
layer: exponential backoff starting at 1s, doubling per attempt, capped at 60s
per interval, retrying until **15 minutes** have elapsed (hardcoded). There is
no attempt cap. A cancelled context aborts immediately.

Consequences for michael:

- An outage shorter than ~15 minutes is invisible to users **if** michael fails
  fast: the operation succeeds on a later retry and the backup completes.
- Every response that hangs (e.g. waiting on a dead gateway's dial timeout)
  burns the client's fixed 15-minute window without advancing it.

## Permanent vs retryable status codes

`IsPermanentError` for the REST backend: **404, 401, 403, 416, 507** abort the
operation immediately. Everything else — 500, 502, **503**, timeouts, resets,
any transport error — is retried for the full window.

| michael returns | restic does |
|---|---|
| 500 / 503 | retries with backoff, up to 15 min |
| 403 (WORM violation, "already exists") | fails the operation permanently |
| 404 on HEAD | treats as "does not exist" (permanent, but often the expected answer) |
| 400 | retried (not in the permanent set) — avoid for terminal conditions |

Restic does **not** read `Retry-After`; its backoff is fixed client-side. The
header is still worth sending for other clients, but it cannot pace restic.

## The per-file Load breaker

Restic keeps its own circuit breaker per file: a `Load` that exhausts retries
on a *non-permanent* error marks that file failed for **one hour**, and every
further read of it fails instantly. A transient gateway blip surfaced as a 500
can therefore lock a client out of a pack file for an hour mid-restore — which
is why michael masks single-gateway failures instead of forwarding them.

## Save failure recovery, and the WORM trap

On a failed `Save`, restic issues a cleanup `Remove` for the possibly-partial
upload (errors ignored — rest-server reports `HasAtomicReplace=false`), rewinds
its pack (restic's own body IS seekable) and re-POSTs.

On a WORM repository this recovery used to be a trap. If the failure was
*ambiguous* — michael reported an error but the gateway committed the object:

1. the cleanup `Remove` is refused (WORM forbids deleting data blobs);
2. the re-POST hits the `If-None-Match: *` precondition → 412;
3. michael surfaced that as 403 "Blob already exists";
4. 403 is permanent → the backup failed hard, with the blob stored correctly.

Michael therefore converges this case: a write-once PUT that fails its
precondition, for a content-addressed key, where the existing object's size
matches the incoming one, returns 200 (see `S3Storage.PutObject`). Blob keys
are the content's sha256 and michael verified that hash when the object was
first written, so the size check identifies the same blob without re-reading
it. The config object's key is not content-addressed and is excluded.

## Save bodies vs michael's PUT path

Restic retries `Save` with a rewindable body — but the stream michael proxies
to S3 is **not** seekable, which is why the aws-sdk retryer is disabled on
michael's PUT path and michael never retries an upload itself: any transient
failure surfaces once, cleanly, and restic re-drives the upload end-to-end.
