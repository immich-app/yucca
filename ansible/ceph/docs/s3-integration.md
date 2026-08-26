# S3 Integration Guide

Audience: Application developers (Yucca, Immich, Restic, internal tooling).

## Endpoints

The cluster runs Ceph RGW (RADOS Gateway) on every node behind a self-signed
wildcard TLS certificate on **port 443**.

| Style | URL |
|---|---|
| Path-style | `https://s3.staging.austin.int.futo.cloud/<bucket>/<key>` |
| Virtual-hosted | `https://<bucket>.s3.staging.austin.int.futo.cloud/<key>` |
| Direct (per-node) | `https://10.10.10.90:443`, `https://10.10.10.91:443`, `https://10.10.10.92:443` |

Region: **us-east-1**

Path-style is recommended for simplicity. Virtual-hosted requires wildcard DNS
(see DNS section below).

## Getting credentials

### Option A: 1Password (preferred)

S3 credentials for the `svc-yucca-restic` service account are stored in
1Password after initial deployment. Ask the infrastructure team for access to
the "Ceph S3" vault entry.

### Option B: radosgw-admin (infra operators only)

SSH to the bootstrap node (sietch-ceph-laurel) and run:

```bash
radosgw-admin user info --uid=svc-yucca-restic
```

The `keys[0].access_key` and `keys[0].secret_key` fields contain the
credentials.

To create a new service account:

```bash
radosgw-admin user create \
  --uid=svc-myapp \
  --display-name='myapp service account' \
  --max-buckets=100
```

## Service accounts

| UID | Purpose | Buckets | Caps |
|---|---|---|---|
| `svc-yucca-restic` | michael's restic object store (one bucket per repository) | per-cluster `rgw_restic_max_buckets` (sietch 100, spice 0 = unlimited) | — |
| `metrics-worker` | yucca-metrics-worker usage scraping via the RGW admin API | 0 | `buckets=read;usage=read;metadata=read;users=read` |
| `svc-yucca-db-backup` | CNPG (yucca-database) WAL archiving + base backups via the Barman Cloud plugin | 1 | — |
| `svc-yucca-terraform` | the radosgw terraform provider's admin credential (manages the users above) | 0 | `buckets=*;metadata=*;users=*` |

All four use predetermined, TF-minted keys (see [secrets.md](secrets.md)).
`svc-yucca-terraform` is bootstrapped by `rgw.yml` (Step 14.7); the three
service users are terraform-managed via the ceph stack's `rgw-users.tf`,
created on the first apply after the cluster's `manage_rgw_users` flag is
set. `svc-yucca-db-backup`'s bucket is NOT auto-created —
barman-cloud fails with `NoSuchBucket` until it exists. Create it once per
cluster with the user's own credentials (`--max-buckets=1` permits exactly this
one bucket):

```bash
AWS_ACCESS_KEY_ID=$(op read "op://<vault>/<CLUSTER>_CEPH_S3_SVC_YUCCA_DB_BACKUP_ACCESS_KEY/password") \
AWS_SECRET_ACCESS_KEY=$(op read "op://<vault>/<CLUSTER>_CEPH_S3_SVC_YUCCA_DB_BACKUP_SECRET_KEY/password") \
aws s3api create-bucket --bucket yucca-db-backups \
  --endpoint-url https://s3.<cluster domain> --no-verify-ssl
```

(Or a named profile holding the same keys, per the AWS CLI section below.)

The k8s side consumes the keys plus the RGW cert from the TF-provisioned
`yucca-db-backup-s3` Secret.

## Self-signed certificate handling

The cluster uses a self-signed wildcard certificate. Every client must either
trust the CA or disable TLS verification.

### Trusting the cert (recommended for production workloads)

Copy the cert from the bootstrap node:

```bash
scp ansible-iac@10.10.10.90:/etc/ceph/rgw-ssl.crt ./rgw-ssl.crt
```

Then pass it to your client (examples below).

### Disabling verification (quick testing only)

Pass `--no-verify-ssl` (AWS CLI) or `verify=False` (boto3). Fine for
benchmarking, not for production.

## AWS CLI configuration

### ~/.aws/credentials

```ini
[sietch]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
```

### ~/.aws/config

```ini
[profile sietch]
region = us-east-1
endpoint_url = https://s3.staging.austin.int.futo.cloud
s3 =
    signature_version = s3v4
    addressing_style = path
```

### Basic operations

```bash
# List buckets
aws --profile sietch --no-verify-ssl s3 ls

# Create a bucket
aws --profile sietch --no-verify-ssl s3 mb s3://my-bucket

# Upload a file
aws --profile sietch --no-verify-ssl s3 cp ./file.txt s3://my-bucket/file.txt

# List objects
aws --profile sietch --no-verify-ssl s3 ls s3://my-bucket/

# Download
aws --profile sietch --no-verify-ssl s3 cp s3://my-bucket/file.txt ./downloaded.txt

# Using the CA bundle instead of --no-verify-ssl
aws --profile sietch --ca-bundle ./rgw-ssl.crt s3 ls
```

## boto3 (Python)

```python
import boto3
import botocore
import urllib3

# Suppress InsecureRequestWarning when verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.staging.austin.int.futo.cloud",
    aws_access_key_id="YOUR_ACCESS_KEY",
    aws_secret_access_key="YOUR_SECRET_KEY",
    region_name="us-east-1",
    verify=False,  # or path to rgw-ssl.crt
    config=botocore.config.Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
    ),
)

# Create a bucket
s3.create_bucket(Bucket="my-bucket")

# Upload
s3.put_object(Bucket="my-bucket", Key="hello.txt", Body=b"hello world")

# Download
obj = s3.get_object(Bucket="my-bucket", Key="hello.txt")
data = obj["Body"].read()

# List objects
response = s3.list_objects_v2(Bucket="my-bucket")
for item in response.get("Contents", []):
    print(item["Key"], item["Size"])
```

To use the CA bundle instead of disabling verification:

```python
s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.staging.austin.int.futo.cloud",
    aws_access_key_id="YOUR_ACCESS_KEY",
    aws_secret_access_key="YOUR_SECRET_KEY",
    region_name="us-east-1",
    verify="/path/to/rgw-ssl.crt",
    config=botocore.config.Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
    ),
)
```

## Restic

```bash
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY"
export RESTIC_REPOSITORY="s3:https://s3.staging.austin.int.futo.cloud/restic-backups"

# Init (first time)
restic init --option s3.region=us-east-1

# Backup
restic backup /data --option s3.region=us-east-1
```

Note: Restic uses the Go AWS SDK. For self-signed certs, set
`AWS_CA_BUNDLE=/path/to/rgw-ssl.crt` or use the system trust store.

## Bucket creation

Buckets are created via any S3 client. The `svc-yucca-restic` service account
has a limit of 100 buckets (configurable via `radosgw-admin user modify
--max-buckets`).

```bash
# AWS CLI
aws --profile sietch --no-verify-ssl s3 mb s3://my-new-bucket

# boto3
s3.create_bucket(Bucket="my-new-bucket")
```

Bucket data lands in the EC data pool (`dev-z1.rgw.buckets.data`). Index
metadata goes to a separate replicated pool. No pool-level configuration is
needed from the application side.

## DNS setup for virtual-hosted buckets

Virtual-hosted bucket addressing (e.g., `https://my-bucket.s3.staging.austin.int.futo.cloud`)
requires two DNS records:

```
s3.staging.austin.int.futo.cloud.        A  10.10.10.90
s3.staging.austin.int.futo.cloud.        A  10.10.10.91
s3.staging.austin.int.futo.cloud.        A  10.10.10.92
*.s3.staging.austin.int.futo.cloud.      A  10.10.10.90
*.s3.staging.austin.int.futo.cloud.      A  10.10.10.91
*.s3.staging.austin.int.futo.cloud.      A  10.10.10.92
```

Round-robin A records across all three nodes.

These records are live and managed in this repo: `tf/deployment/dev/dns/`
(Cloudflare, futo.cloud zone). They resolve publicly but point at the
management VLAN, so they are only routable from networks that reach
10.10.10.0/24. To change them, edit `records.auto.tfvars` and
`TF_STACK_DIR=tf/deployment/dev/dns mise run tf:apply`.

## Performance characteristics

| Property | Value |
|---|---|
| Data pool | Erasure coded, k=8 m=3, failure domain=OSD |
| Index pool | Replicated, size=2, min_size=1 |
| Storage media | HDD-backed (HGST 6 TB SAS drives) |
| Block.db | SSD-backed (Micron 5100 3.8 TB) |
| Nodes | 3 (Dell R730xd) |
| RGW daemons | 1 per node |
| TLS | Self-signed wildcard, 10-year validity |
| Network | 10 GbE bonded active-backup (no LACP) |

### What to expect

- **Throughput**: HDD-bound for large objects. A single node can sustain
  roughly 500-800 MiB/s aggregate reads from its HDDs. With 3 nodes and
  EC 8+3, expect 300-600 MiB/s aggregate for large sequential workloads
  depending on concurrency and object size.
- **Latency**: Higher than SSD or cloud S3. Small object PUTs (< 1 MiB) will
  see 10-50 ms latency due to HDD seeks. Use concurrency to amortize.
- **IOPS**: Low single-drive IOPS (100-200 per HDD). Use larger objects
  (16+ MiB) to maximize throughput.
- **EC overhead**: Usable capacity is raw * k/(k+m) = raw * 8/11 = ~72.7%
  of raw HDD capacity.
- **Single network**: Public and cluster traffic share the same 10 GbE bond.
  Recovery/rebalancing events will compete with client I/O.

### Benchmarking

The cluster includes a benchmark tool at `roles/s3_bench/files/s3bench.py`:

```bash
python3 s3bench.py \
  --endpoint https://10.10.10.90:443 \
  --access-key KEY \
  --secret-key SECRET \
  --bucket s3bench \
  --num-objects 100 \
  --object-size-mb 16 \
  --concurrency 8 \
  --ops put \
  --log /tmp/bench.jsonl
```

Supports `put`, `get`, `delete`, and `mixed` (70/20/10 split) operations.
Results include throughput (MiB/s), IOPS, and p50/p95/p99 latencies.
