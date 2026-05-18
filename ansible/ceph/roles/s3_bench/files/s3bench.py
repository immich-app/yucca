#!/usr/bin/env python3
"""S3 benchmark — parallel PUT/GET/DELETE with JSONL logging.

Designed for Ceph RGW performance testing. Each object is random data
at a configurable size (default 16 MiB). Results are logged per-op to
a JSONL file for post-processing.

Usage:
    s3bench.py --endpoint https://127.0.0.1:443 \
               --access-key KEY --secret-key SECRET \
               --bucket s3bench --num-objects 1000 \
               --concurrency 8 --object-size-mb 16 \
               --ops put --key-offset 0 --key-prefix bench \
               --log /var/log/s3bench/run.jsonl

Ops modes:
    put     — upload N objects
    get     — download N objects (must exist)
    delete  — delete N objects
    mixed   — 70% put, 20% get, 10% delete
"""

import argparse
import json
import os
import random
import sys
import time
import urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import boto3
import botocore

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def make_client(endpoint, access_key, secret_key, region, ssl_verify):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        verify=ssl_verify,
        config=botocore.config.Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 2},
        ),
    )


def ensure_bucket(client, bucket):
    try:
        client.head_bucket(Bucket=bucket)
    except botocore.exceptions.ClientError:
        client.create_bucket(Bucket=bucket)


def gen_key(prefix, index):
    return f"{prefix}/{index:010d}"


def do_put(client, bucket, key, data):
    t0 = time.monotonic()
    client.put_object(Bucket=bucket, Key=key, Body=data)
    return time.monotonic() - t0


def do_get(client, bucket, key):
    t0 = time.monotonic()
    resp = client.get_object(Bucket=bucket, Key=key)
    resp["Body"].read()
    return time.monotonic() - t0


def do_delete(client, bucket, key):
    t0 = time.monotonic()
    client.delete_object(Bucket=bucket, Key=key)
    return time.monotonic() - t0


def run_bench(args):
    client = make_client(
        args.endpoint, args.access_key, args.secret_key,
        args.region, args.ssl_verify,
    )
    ensure_bucket(client, args.bucket)

    obj_bytes = args.object_size_mb * 1024 * 1024
    data = os.urandom(obj_bytes)

    log_fh = None
    if args.log:
        os.makedirs(os.path.dirname(args.log), exist_ok=True)
        log_fh = open(args.log, "a")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    completed = 0
    errors = 0
    total_bytes = 0
    latencies = []
    t_start = time.monotonic()

    def dispatch(i):
        key = gen_key(args.key_prefix, args.key_offset + i)
        op = args.ops
        if op == "mixed":
            r = random.random()
            op = "put" if r < 0.7 else ("get" if r < 0.9 else "delete")
        try:
            if op == "put":
                lat = do_put(client, args.bucket, key, data)
                return op, lat, obj_bytes, None
            elif op == "get":
                lat = do_get(client, args.bucket, key)
                return op, lat, obj_bytes, None
            elif op == "delete":
                lat = do_delete(client, args.bucket, key)
                return op, lat, 0, None
        except Exception as e:
            return op, 0, 0, str(e)

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {pool.submit(dispatch, i): i for i in range(args.num_objects)}
        for fut in as_completed(futures):
            op, lat, nbytes, err = fut.result()
            completed += 1
            if err:
                errors += 1
            else:
                latencies.append(lat)
                total_bytes += nbytes
            if log_fh:
                log_fh.write(json.dumps({
                    "run_id": run_id,
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "op": op, "latency_s": round(lat, 4),
                    "bytes": nbytes, "error": err,
                    "endpoint": args.endpoint,
                }) + "\n")
            if completed % 100 == 0:
                elapsed = time.monotonic() - t_start
                rate_mb = (total_bytes / 1024 / 1024) / elapsed if elapsed > 0 else 0
                print(f"  {completed}/{args.num_objects}  "
                      f"{rate_mb:.1f} MiB/s  errors={errors}")

    elapsed = time.monotonic() - t_start
    if log_fh:
        log_fh.close()

    latencies.sort()
    summary = {
        "run_id": run_id,
        "endpoint": args.endpoint,
        "ops": args.ops,
        "num_objects": args.num_objects,
        "object_size_mb": args.object_size_mb,
        "concurrency": args.concurrency,
        "completed": completed,
        "errors": errors,
        "elapsed_s": round(elapsed, 2),
        "throughput_mib_s": round((total_bytes / 1024 / 1024) / elapsed, 2) if elapsed > 0 else 0,
        "iops": round(completed / elapsed, 2) if elapsed > 0 else 0,
        "latency_avg_ms": round(sum(latencies) / len(latencies) * 1000, 1) if latencies else 0,
        "latency_p50_ms": round(latencies[len(latencies) // 2] * 1000, 1) if latencies else 0,
        "latency_p95_ms": round(latencies[int(len(latencies) * 0.95)] * 1000, 1) if latencies else 0,
        "latency_p99_ms": round(latencies[int(len(latencies) * 0.99)] * 1000, 1) if latencies else 0,
    }
    print(json.dumps(summary, indent=2))
    return summary


def main():
    p = argparse.ArgumentParser(description="S3 benchmark")
    p.add_argument("--endpoint", required=True)
    p.add_argument("--access-key", required=True)
    p.add_argument("--secret-key", required=True)
    p.add_argument("--bucket", default="s3bench")
    p.add_argument("--num-objects", type=int, default=1000)
    p.add_argument("--object-size-mb", type=int, default=16)
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--ops", choices=["put", "get", "delete", "mixed"], default="put")
    p.add_argument("--key-offset", type=int, default=0)
    p.add_argument("--key-prefix", default="bench")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--ssl-verify", action="store_true", default=False)
    p.add_argument("--log", default=None)
    args = p.parse_args()
    run_bench(args)


if __name__ == "__main__":
    main()
