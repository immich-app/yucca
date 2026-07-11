#!/usr/bin/env python3
# Drift check: the prod S3 RGW DNS endpoint vs the ceph ingress VIP.
#
# The A-records for s3.prod.fsn1.htz.futo.cloud (+ the *.s3... wildcard) in
# tf/deployment/prod/global/dns/records.auto.tfvars point at a single health-checked
# Ceph ingress VIP (haproxy + keepalived), 10.40.20.250 -- NOT a round-robin over
# the node fabric IPs. keepalived floats the VIP and haproxy health-checks the RGW
# backends, so node add/replace/remove is handled by the load balancer, not by
# editing DNS. What can still drift is the VIP value itself: if the apex or wildcard
# stops resolving to exactly the expected VIP (typo, stale multi-value roster left
# behind, apex/wildcard disagreeing) the endpoint blackholes or splits.
#
# So this check asserts both S3 names resolve to exactly one A-record whose value is
# the expected ingress VIP. The source of truth for the VIP is the ansible ceph side
# (`ceph_rgw_ingress_vip` in the spice group_vars); EXPECTED_VIP below is the pinned
# constant and MUST match it -- change both together. Credential-free, stdlib-only
# (no remote state, no provider, no PyYAML) so it runs in any CI runner or pre-commit.
#
# Exit: 0 = in sync, 1 = drift (details printed), 2 = parse/usage error.
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DNS_TFVARS = ROOT / "tf/deployment/prod/global/dns/records.auto.tfvars"

# The expected Ceph ingress VIP. Source of truth is the ansible ceph var
# `ceph_rgw_ingress_vip` (spice group_vars); keep this constant equal to it. Both
# the apex and the *.<apex> wildcard (virtual-hosted buckets) must resolve here.
EXPECTED_VIP = "10.40.20.250"

S3_APEX = "s3.prod.fsn1.htz.futo.cloud"
S3_NAMES = (S3_APEX, f"*.{S3_APEX}")


def die(msg):
    sys.exit(f"check-s3-dns-roster: {msg}")


def read(path):
    if not path.is_file():
        die(f"missing input: {path}")
    return path.read_text()


def parse_dns_records(text):
    """{fqdn: sorted[ip]} for the S3 A-records in records.auto.tfvars.

    Each entry is `"<fqdn>" = { type=.. values=[..] .. }`; the values list holds
    no braces, so a non-greedy `{...}` cleanly bounds one entry. IPs are read only
    from inside `values = [ ... ]`, never from surrounding comments.
    """
    out = {}
    for name, body in re.findall(r'"([^"]+)"\s*=\s*\{(.*?)\}', text, re.DOTALL):
        if name not in S3_NAMES:
            continue
        vm = re.search(r"values\s*=\s*\[(.*?)\]", body, re.DOTALL)
        if not vm:
            die(f'record "{name}" has no values list')
        out[name] = sorted(re.findall(r'"(\d+\.\d+\.\d+\.\d+)"', vm.group(1)))
    return out


def main():
    dns = parse_dns_records(read(DNS_TFVARS))

    if not dns:
        die("no S3 A-records found in records.auto.tfvars")

    problems = []
    for name in S3_NAMES:
        if name not in dns:
            problems.append(f'DNS record "{name}" is absent from records.auto.tfvars')
            continue
        actual = dns[name]
        if actual != [EXPECTED_VIP]:
            problems.append(
                f'"{name}": resolves to {actual}, expected exactly ["{EXPECTED_VIP}"] '
                f"(the ceph ingress VIP)"
            )

    if problems:
        print("S3 DNS endpoint is OUT OF SYNC with the ceph ingress VIP:\n", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        print(
            f"\nFix: set the apex + wildcard A-records in records.auto.tfvars to the "
            f"single ingress VIP\n{EXPECTED_VIP} (= ansible ceph_rgw_ingress_vip), then "
            f"re-run this check.",
            file=sys.stderr,
        )
        return 1

    print(
        f"S3 DNS endpoint in sync: apex + wildcard both resolve to the ceph ingress "
        f"VIP {EXPECTED_VIP}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
