#!/usr/bin/env python3
# Generate ansible/ceph/inventories/prod-htz-fsn1/spice/host_vars/<host>.yml from
# tf/deployment/prod/htz-fsn1/ceph/spice-hosts.yaml (the single source of truth).
#
# host_vars is committed (per-node hardware facts are stable inventory truth). The
# reprovision play needs hetzner_server_number + bond_ip; host_index/mon feed the
# later networkd + ceph_deploy convergence. NIC names (bond_interfaces/oob_nic) are
# uniform across the fleet and live in group_vars/all/vars.yml, not per host. The
# ceph_hdd_osds by-path OSD map is deferred until node-1 inspection and appended later.
#
# Idempotent: skips files that already exist unless --force is passed (so a
# hand-added ceph_hdd_osds block is never clobbered).
import sys
import pathlib

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required: pip install pyyaml (or run under mise)")

ROOT = pathlib.Path(__file__).resolve().parents[3]
ROSTER = ROOT / "tf/deployment/prod/htz-fsn1/ceph/spice-hosts.yaml"
OUT = ROOT / "ansible/ceph/inventories/prod-htz-fsn1/spice/host_vars"

force = "--force" in sys.argv
roster = yaml.safe_load(ROSTER.read_text())
OUT.mkdir(parents=True, exist_ok=True)

wrote = skipped = 0
for host, h in roster["hosts"].items():
    f = OUT / f"{host}.yml"
    if f.exists() and not force:
        print(f"skip (exists): {f.name}")
        skipped += 1
        continue
    f.write_text(
        "---\n"
        f"hostname_short: {host}\n"
        f"bond_ip: {h['public_ip']}\n"
        f"hetzner_server_number: {h['server_number']}\n"
        f"host_index: {h['host_index']}\n"
        f"mon: {str(h['mon']).lower()}\n"
        "# ceph_hdd_osds: defined in group_vars/all/vars.yml (SX295 by-path map is\n"
        "# uniform across nodes). Override here ONLY if a node's by-path differs\n"
        "# (e.g. spice-ceph-miguel). Verify with: ls -l /dev/disk/by-path/pci-*-ata-*\n"
    )
    print(f"wrote: {f.name}")
    wrote += 1

print(f"\n{wrote} written, {skipped} skipped -> {OUT}")
