#!/usr/bin/env python3
"""Diff a declared Ceph config model against the live mon config database.

Read-only: this computes what would change and prints it as JSON. Applying the
result is the caller's job, which keeps the script safe to run in check mode and
keeps Ansible's changed_when honest.

Input (JSON) comes from $CEPH_CONFIG_MODEL, or stdin when that is unset --
ansible.builtin.script cannot pass stdin, and the stdin path keeps the script
runnable by hand against a dump for debugging:
  {
    "desired":   {"<who>": {"<option>": <value>, ...}, ...},
    "prune":     [{"section": "global", "name": "osd_max_backfills"}, ...],
    "gate_keys": ["osd_mclock_override_recovery_settings", ...]
  }

stdout (JSON):
  {
    "set":     [{"who": ..., "key": ..., "value": ..., "current": ...}, ...],
    "rm":      [{"section": ..., "name": ..., "current": ...}, ...],
    "in_sync": <bool>
  }

`<who>` is any string `ceph config set` accepts: a section (`global`, `osd`), a
single daemon (`osd.5`), or a section with a mask (`osd/class:hdd`,
`osd/host:spice-ceph-alyssa`). Ceph stores the mask as a field separate from the
section, so `osd/host:x` has to be split before it can be matched against a dump
row.

Why a script and not a Jinja comparison: `ceph config dump` reports every value
as a string (`604800.000000` for an int option, `true` for a bool), while the
model holds real YAML types. Ansible's `float` filter returns 0.0 for anything
non-numeric, so a Jinja `| float` comparison would read `balanced` and `dumb` as
equal. Typed comparison has to happen somewhere that can tell those apart.
"""

import json
import os
import subprocess
import sys


def split_who(who):
    """'osd/host:foo' -> ('osd', 'host:foo'); 'osd' -> ('osd', '')."""
    section, sep, mask = who.partition("/")
    return section, mask if sep else ""


def to_ceph_str(value):
    """Render a YAML value the way Ceph would echo it back."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def same_value(desired, live):
    """Compare a model value against a dump string.

    Exact string match first, then a numeric comparison so 604800 matches
    '604800.000000' and 0.1 matches '0.100000'. Anything that is not numeric on
    both sides falls through to unequal rather than being coerced.
    """
    rendered = to_ceph_str(desired)
    if rendered == live:
        return True
    try:
        return float(rendered) == float(live)
    except (TypeError, ValueError):
        return False


def load_live():
    """(section, mask, name) -> value, from the mon config database."""
    out = subprocess.run(
        ["ceph", "config", "dump", "-f", "json"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return {
        (row["section"], row.get("mask", ""), row["name"]): row["value"]
        for row in json.loads(out)
    }


def main():
    raw = os.environ.get("CEPH_CONFIG_MODEL")
    payload = json.loads(raw) if raw else json.load(sys.stdin)
    desired = payload.get("desired", {})
    prune = payload.get("prune", [])
    gate_keys = payload.get("gate_keys", [])

    live = load_live()

    pending = []
    for who, options in desired.items():
        section, mask = split_who(who)
        for key, value in options.items():
            current = live.get((section, mask, key))
            if current is not None and same_value(value, current):
                continue
            pending.append(
                {
                    "who": who,
                    "key": key,
                    "value": to_ceph_str(value),
                    "current": current,
                }
            )

    # Gating options first. osd_mclock_override_recovery_settings has to be true
    # before osd_max_backfills or osd_recovery_max_active will stick, and dict
    # ordering in the model is not a contract we want to depend on.
    gate_rank = {key: i for i, key in enumerate(gate_keys)}
    pending.sort(key=lambda c: (gate_rank.get(c["key"], len(gate_rank)), c["who"], c["key"]))

    # Prune is an explicit allowlist, never "everything the model does not
    # declare". The mon database also holds keys owned by other systems --
    # cephadm's per-host osd_memory_target masks, the dashboard credentials,
    # telemetry channels, container_image -- and removing those would be
    # destructive. Only entries named here are candidates.
    removals = [
        {
            "section": entry["section"],
            "name": entry["name"],
            "current": live[(entry["section"], entry.get("mask", ""), entry["name"])],
        }
        for entry in prune
        if (entry["section"], entry.get("mask", ""), entry["name"]) in live
    ]

    json.dump(
        {"set": pending, "rm": removals, "in_sync": not pending and not removals},
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
