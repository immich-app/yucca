# Runbook: Upgrade Ceph (cephadm-orchestrated) and Roll Back

**When:** moving the cluster to a new patch release on the pinned Tentacle
20.2.x train (e.g. 20.2.1 -> 20.2.2), or rolling back a bad upgrade.

**Time estimate:** 20-60 min for a small cluster; scales with daemon/OSD count
(cephadm rolls one daemon type at a time and waits for health between steps).

**Playbook:** `upgrade-ceph.yml` (+ `tasks/ceph_upgrade.yml`). It is a
deliberate, manually-invoked day-2 op and is **not** in `site.yml` -- converge
never triggers an upgrade.

---

## What the playbook guarantees

1. **Preflight gate** (refuses otherwise): cluster is `HEALTH_OK`, no upgrade
   already in progress, and every OSD is up + in.
2. **Rollback anchor recorded**: it prints the image(s) the daemons are running
   *now* before touching anything -- copy this for step-4 rollback.
3. **Explicit target required**: no default image/version is baked in.
4. **Bounded poll**: watches `ceph orch upgrade status`; fails loudly if
   cephadm pauses/stalls the upgrade (it auto-pauses on a failed step).
5. **Post-checks**: asserts `HEALTH_OK` and that all daemons converged on one
   version, then prints a summary.
6. **Idempotent**: if the cluster already runs the target image and is
   version-converged, it is a clean no-op.

## Upgrade

```bash
# Preferred: pin the exact image (digest-pinnable, and what rollback consumes).
scripts/ansible-play.sh upgrade-ceph.yml \
  -e ceph_upgrade_target_image=quay.io/ceph/ceph:v20.2.2

# Or by version (cephadm resolves the image):
scripts/ansible-play.sh upgrade-ceph.yml -e ceph_upgrade_version=20.2.2
```

Optional toggles:

```bash
# Proceed on a benign HEALTH_WARN (review `ceph health detail` first):
-e ceph_upgrade_allow_health_warn=true

# Widen the poll bound (default 120 * 30s = 60 min):
-e ceph_upgrade_poll_retries=240 -e ceph_upgrade_poll_delay=30
```

Preview the preflight/plan without starting anything:

```bash
scripts/ansible-play.sh upgrade-ceph.yml \
  -e ceph_upgrade_target_image=quay.io/ceph/ceph:v20.2.2 --check
```

## Rollback

cephadm upgrades roll one daemon type at a time and auto-**pause** on the first
failure rather than tearing the cluster down. There is no destructive cutover,
so rollback = point the orchestrator back at the **prior** image and let it
converge.

```bash
# 0. Prior image: the play PRINTED it ("ROLLBACK ANCHOR ..."). Otherwise:
ceph orch ps --format json | \
  python3 -c 'import sys,json;print(sorted({d["container_image_name"] for d in json.load(sys.stdin)}))'

# 1. Stop the in-flight upgrade (or `pause`/`resume` to hold and inspect):
ceph orch upgrade stop

# 2. Re-target the prior image (only daemons ahead of it move):
ceph orch upgrade start --image <PRIOR_IMAGE>

# 3. Watch it converge:
ceph orch upgrade status
ceph -W cephadm
watch ceph versions

# 4. Health checks once status shows not in_progress:
ceph health detail    # expect HEALTH_OK
ceph versions         # expect ONE overall version
ceph osd stat         # all OSDs up + in
```

Re-running `upgrade-ceph.yml` with the prior image as the target performs the
same health-gated rollback with all the same checks.

## Podman compatibility (cross-major upgrades)

The baseline role `dpkg`-holds podman (and the rest of its ecosystem) at its
installed version so a stray `apt upgrade` cannot move the container runtime out
from under a live cluster. Patch-train upgrades (20.2.x -> 20.2.y) run on the same
podman, so the hold needs no attention. But a **cross-major Ceph upgrade** may
require a newer podman per the cephadm compatibility matrix, and the hold will
block the podman bump. When that applies:

```bash
# On each node (drive via a serial, health-gated converge, not all at once):
apt-mark unhold podman
apt-get install -y --only-upgrade podman   # to a version the cephadm matrix allows
apt-mark hold podman                        # re-freeze at the new version
```

Do this BEFORE `ceph orch upgrade start`, verify `podman version` on every node,
then upgrade Ceph. Check the cephadm podman support matrix for the target release
first; too-new podman can also break cephadm, so bump to a *supported* version,
not merely the latest. `baseline_held_packages` controls which packages are held.

## Gotchas

- **No cross-major downgrade.** Rollback is only safe *within* the pinned
  20.2.x train (patch level). Do not use this to cross 20.x -> 19.x -- Ceph does
  not support it.
- **Paused mid-upgrade.** If the poll assert fails, the upgrade paused. Inspect
  `ceph orch upgrade status` (`message` field) and `ceph -W cephadm`, fix the
  offending daemon/host, then `ceph orch upgrade resume` -- or stop and roll
  back per above.
- **Bootstrap host in `--limit`.** All cluster ops delegate to the bootstrap
  node; do not `--limit` it out of the run.
- **Registry reachability.** Nodes must be able to pull the target image. A
  stalled pull shows up as a paused upgrade with a pull error in the message.

## References

- `upgrade-ceph.yml` -- the playbook; its header carries the same rollback
  procedure inline.
- `docs/runbooks/replace-host.md`, `docs/runbooks/add-node.md` -- related day-2
  ops that also drive `ceph` from the bootstrap node.

## Post-upgrade: monk

monk (`roles/scrub_exporter`) runs on the mon hosts from a container based
on the cluster ceph image. After an upgrade: bump `ARG CEPH_IMAGE` in
`packages/monk/Dockerfile` to the new release (the mons' layer dedup depends
on it), re-pin `ceph_scrub_exporter_image` once CI publishes the rebuilt
tag, and re-run `mise run monk`. Then watch two canaries for format drift in
the new release: `ceph_scrub_schedule_pgs{state="other"}` staying 0, and the
parse-error alert staying quiet. A flapping monk unit triages like any
podman systemd unit: `journalctl -u monk` on the mon; the newest error or
warn line is the current failure.
