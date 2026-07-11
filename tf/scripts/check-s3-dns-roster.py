#!/usr/bin/env python3
# Drift check: the prod S3 RGW DNS roster vs the ceph node roster.
#
# The A-records for s3.prod.fsn1.htz.futo.cloud (+ the *.s3... wildcard) in
# tf/deployment/prod/global/dns/records.auto.tfvars are a round-robin over every
# IN-SERVICE spice ceph node's FABRIC public IP (10.<site>.<public_octet>.<host_index>,
# VLAN 120). That list is hand-maintained: nothing links it to the ceph stack, so
# adding/replacing/removing a node silently blackholes the endpoint (a stale IP that
# routes nowhere) or drops capacity (a live node missing from rotation).
#
# There is no TF output to derive it from: the ceph `hosts` schema and the ceph
# `discovery` output carry only the WAN bond_ip, never host_index or the fabric IP.
# The single source of truth for name -> host_index -> fabric IP is the sidecar
# spice-hosts.yaml; the in-service set is clusters.auto.tfvars (a held/triage node is
# commented out there). So this check reconstructs the expected roster from those two
# ceph files and asserts the DNS values match, exactly. Credential-free, stdlib-only
# (no remote state, no provider, no PyYAML) so it runs in any CI runner or pre-commit.
#
# Exit: 0 = in sync, 1 = drift (details printed), 2 = parse/usage error.
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DNS_TFVARS = ROOT / "tf/deployment/prod/global/dns/records.auto.tfvars"
CEPH_TFVARS = ROOT / "tf/deployment/prod/htz-fsn1/ceph/clusters.auto.tfvars"
SPICE_HOSTS = ROOT / "tf/deployment/prod/htz-fsn1/ceph/spice-hosts.yaml"

# The S3 endpoint whose A-records must equal the in-service node roster. Both the
# apex and the *.<apex> wildcard (virtual-hosted buckets) round-robin the same set.
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


def parse_in_service_names(text):
    """Short host names of the in-service ceph nodes in clusters.auto.tfvars.

    Each host is `{ name = "<n>", ... }`; a held node is commented out (leading #),
    so lines whose first non-space char is # are skipped -- that is exactly how the
    roster records a node held out of the RGW rotation (e.g. noreen in triage).
    """
    names = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        m = re.search(r'\bname\s*=\s*"([a-z0-9]+)"', line)
        if m:
            names.append(m.group(1))
    if not names:
        die("no host names parsed from clusters.auto.tfvars")
    return names


def parse_spice_hosts(text):
    """(site_id, cluster_id, {short_name: host_index}) from spice-hosts.yaml.

    Regular, shallow YAML: top-level `site_id`/`cluster_id`, then `hosts:` keyed by
    `spice-ceph-<name>` each with a `host_index`. Parsed with regex to stay
    dependency-free (no PyYAML in a bare CI runner).
    """

    def scalar(key):
        m = re.search(rf"^{key}:\s*(\d+)\s*$", text, re.MULTILINE)
        if not m:
            die(f"spice-hosts.yaml missing top-level {key}")
        return int(m.group(1))

    site_id = scalar("site_id")
    cluster_id = scalar("cluster_id")

    index_by_name = {}
    current = None
    for line in text.splitlines():
        host = re.match(r"^  (spice-ceph-[a-z0-9]+):\s*$", line)
        if host:
            current = host.group(1)[len("spice-ceph-"):]
            continue
        idx = re.match(r"^    host_index:\s*(\d+)\s*$", line)
        if idx and current:
            index_by_name[current] = int(idx.group(1))
    if not index_by_name:
        die("no hosts parsed from spice-hosts.yaml")
    return site_id, cluster_id, index_by_name


def main():
    dns = parse_dns_records(read(DNS_TFVARS))
    in_service = parse_in_service_names(read(CEPH_TFVARS))
    site_id, cluster_id, index_by_name = parse_spice_hosts(read(SPICE_HOSTS))

    # Fabric public network = 10.<site>.<cluster_id*16+4>.0/23 (cls1 -> 10.40.20.0/23);
    # each node sits at .<host_index>. See tf/shared/modules/fabric-addressing/main.tf
    # (cluster /20 base = cluster_id*16; public is the +4 /23 block).
    public_octet = cluster_id * 16 + 4
    prefix = f"10.{site_id}.{public_octet}."

    problems = []

    # Every in-service node must map to a host_index, and that yields its expected IP.
    expected = set()
    for name in sorted(in_service):
        idx = index_by_name.get(name)
        if idx is None:
            problems.append(
                f"in-service node '{name}' (clusters.auto.tfvars) has no entry in "
                f"spice-hosts.yaml -- cannot resolve its fabric IP"
            )
            continue
        expected.add(f"{prefix}{idx}")

    if not dns:
        die("no S3 A-records found in records.auto.tfvars")

    for name in S3_NAMES:
        actual = set(dns.get(name, []))
        if name not in dns:
            problems.append(f'DNS record "{name}" is absent from records.auto.tfvars')
            continue
        missing = expected - actual  # live node, but no A-record -> lost capacity
        extra = actual - expected  # A-record with no live node -> blackhole / stale
        for ip in sorted(missing, key=lambda s: int(s.rsplit(".", 1)[1])):
            problems.append(f'"{name}": missing {ip} (in-service node not in rotation -> lost capacity)')
        for ip in sorted(extra, key=lambda s: int(s.rsplit(".", 1)[1])):
            problems.append(f'"{name}": stale {ip} (A-record has no in-service node -> blackhole)')

    # The apex and wildcard must round-robin an identical set.
    if set(dns.get(S3_APEX, [])) != set(dns.get(f"*.{S3_APEX}", [])):
        problems.append("apex and wildcard A-record sets differ from each other")

    if problems:
        print("S3 DNS roster is OUT OF SYNC with the ceph node roster:\n", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        print(
            "\nFix: regenerate records.auto.tfvars from the in-service nodes in "
            "clusters.auto.tfvars\n(host_index -> fabric IP via spice-hosts.yaml), "
            "then re-run this check.",
            file=sys.stderr,
        )
        return 1

    print(
        f"S3 DNS roster in sync: {len(expected)} in-service nodes == "
        f"{len(dns[S3_APEX])} A-records (apex + wildcard), prefix {prefix}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
