# Runbook: Take a Host Offline for Physical Maintenance

**When:** A node must be powered off or rebooted for longer than a few minutes.
DIMM or NIC swap, cable reseating, chassis work, anything where remote hands need
the machine down.

**Not for a plain disk swap.** Hetzner will hot-swap a drive on a live SX295 if
the ticket asks for `hot_swap`, so a failed disk whose OSD is already `down` and
`out` needs no maintenance window. See
[replace-disk.md](replace-disk.md).

**Time estimate:** 2 minutes to enter, 2 minutes to exit. The offline window is
whatever the physical work takes.

**Prerequisites:**
- Cluster is not already degraded from something else
- No backfill in flight that you care about finishing first
- The host carries no MON you cannot afford to lose (see step 1)

> This runbook is cluster-agnostic, but the worked numbers are spice. Resolve
> `<host>` and the admin CLI for your cluster from
> [cluster-profiles.md](../cluster-profiles.md).

---

## Use maintenance mode, not the cluster-wide flags

`ceph orch host maintenance enter` is the supported path and it does three
things that hand-set flags do not:

1. Runs `ok-to-stop` against **every** daemon type on the host, not just OSDs
2. Stops **and disables** the `ceph-<fsid>.target` systemd unit, so a power-on
   does not bring daemons back before you are ready
3. Applies `noout` to the host's **CRUSH subtree** via `osd set-group noout
   <host>`, rather than the cluster-wide `noout` flag

Do **not** also set `norebalance`, `nobackfill` or `norecover`. They are
cluster-wide, and they are aimed at the wrong problem: `noout` already prevents
the OSDs from being marked `out`, so their PGs are never remapped and there is no
rebalance to suppress. Setting `norebalance` would instead pause legitimate
recovery elsewhere in the cluster for the entire maintenance window.

### Why noout is the part that matters

`mon_osd_down_out_interval` defaults to **600** seconds. Ten minutes after the
daemons stop, every OSD on the host is marked `out` and its PGs are remapped
onto the rest of the cluster. For a 30-minute window that is a large, pointless
data movement that must then be undone when the host returns. With `noout` the
OSDs stay `in`: PGs go `undersized+degraded` and stay put.

Confirm the interval on your cluster rather than trusting the default, and read
it from the mon, since the config store can hold a value the mon is not running:

```bash
ceph tell mon.<bootstrap-host> config get mon_osd_down_out_interval
```

---

## 1. Confirm the host is safe to lose

```bash
ceph -s
ceph orch host ok-to-stop <host>
```

`ok-to-stop` must pass. It reports per daemon, so read the whole output: an OSD
line saying "safe to restart" does not tell you anything about a MON or an
ingress daemon on the same box.

Check by hand what `ok-to-stop` does not weigh:

```bash
ceph -s | grep -E '^\s+(mon|mgr):'            # is this host in the quorum, or the active mgr?
ceph orch ps <host> --format json | \
  python3 -c 'import sys,json,collections; print(collections.Counter(d["daemon_type"] for d in json.load(sys.stdin)))'
```

Losing one MON of five is fine; losing one of three leaves no margin. If the
host runs the active MGR, a standby takes over and `ceph orch` commands stall for
a few seconds.

**Failure domain.** The pools must tolerate the loss. On spice the EC profile is
`ec-k16m4-host` with `crush-failure-domain=host`, and all replicated rules use
host as well, so a PG has at most one shard on any single node: losing a host
spends one of four tolerated failures. Verify for your cluster:

```bash
ceph osd erasure-code-profile get <profile>   # want crush-failure-domain=host
ceph osd crush rule dump | \
  python3 -c 'import sys,json; [print(r["rule_name"], [s.get("type") for s in r["steps"] if s.get("type")]) for r in json.load(sys.stdin)]'
```

**S3 availability.** An RGW on the host goes away with it. On spice the RGWs sit
behind `ingress.rgw.spice.prod-z1`, whose haproxy health-checks its backends and
routes around a dead one. Confirm the host is not itself running the ingress:

```bash
ceph orch ps --service-name ingress.rgw.<realm> --format json | \
  python3 -c 'import sys,json; [print(d["hostname"]) for d in json.load(sys.stdin)]'
```

## 2. Let in-flight backfill finish

```bash
ceph -s | grep -E 'backfill|recovery|misplaced'
```

Entering maintenance while a backfill is running is not unsafe, but it stalls
any PG whose remaining shards need the host you are about to stop, and it makes
the degraded percentage in step 4 impossible to read against a baseline. If a
rebuild is running, wait for `misplaced` to reach zero.

## 3. Enter maintenance

```bash
ceph orch host maintenance enter <host>
```

Expected:

```
Daemons for Ceph cluster <fsid> stopped on host <host>. Host <host> moved to maintenance mode
```

## 4. Verify before releasing the host

This is the step people skip, and it is the one that matters. The daemons are
stopped **before** `noout` is applied, not after, so a failure in the flag step
leaves the host down and unprotected.

```bash
ceph health detail | grep -A1 OSD_FLAGS
```

```
[WRN] OSD_FLAGS: 1 OSDs or CRUSH {nodes, device-classes} have {NOUP,NODOWN,NOIN,NOOUT} flags set
    host <host> has flags noout
```

**Plain `ceph osd dump` will not show this.** The flag lives on the CRUSH node,
and the text output omits `crush_node_flags` entirely, so `ceph osd dump | grep
noout` returns nothing and reads as a failure when everything is fine. Use
`health detail` above, or ask for JSON:

```bash
ceph osd dump -f json | \
  python3 -c 'import sys,json; print(json.load(sys.stdin)["crush_node_flags"])'
# {'<host>': ['noout']}
```

Then confirm the host status and the shape of the damage:

```bash
ceph orch host ls --host-pattern <host>     # STATUS: Maintenance
ceph -s
```

A healthy maintenance window looks like this. From spice, one 15-OSD host of 48
with EC k16+m4:

```
health: HEALTH_WARN
        1 host is in maintenance mode
        14 osds down
        1 OSDs or CRUSH {nodes, device-classes} have {NOUP,NODOWN,NOIN,NOOUT} flags set
        1 host (15 osds) down
        Degraded data redundancy: ... (2.020%), 1664 pgs degraded, 1670 pgs undersized
osd: 720 osds: 705 up, 719 in
rgw: 47 daemons active (47 hosts, 1 zones)
```

Read it as: `in` count unchanged (that is `noout` working), `up` count down by
the live OSDs on the host, degraded roughly one host's share of the data, and no
PGs `inactive`, `down`, `stale` or `incomplete`. **Inactive PGs mean I/O is
blocked and the host must come back immediately.**

The `up` count drops by the number of *live* OSDs, which is not the same as the
host's OSD count if one was already down. Above, 14 went down but the host owns
15.

Now the machine can be powered off.

## 5. While the host is offline

Nothing to do. Do not "help" by setting more flags. Degraded PGs are expected
and recovery elsewhere in the cluster continues normally.

If the window stretches far beyond plan, the decision to abandon `noout` and let
the cluster re-replicate is a capacity question, not a safety one: at that point
you are choosing to spend free space to restore redundancy. Nothing here expires
on its own.

## 6. Exit maintenance

Once the host is powered on and reachable:

```bash
ceph orch host maintenance exit <host>
ceph orch host ls --host-pattern <host>     # STATUS empty again
ceph -s
```

Exit re-enables the systemd target, starts the daemons, and issues `osd
unset-group noout <host>`. **Nothing starts on its own after a power-on**, because
entering maintenance disabled the target. A host that boots and stays silent is
not broken; it is waiting for this command.

Watch the OSDs return and the degraded count fall:

```bash
watch -n5 'ceph -s | grep -E "osds:|degraded|inactive"'
```

Confirm `noout` is gone:

```bash
ceph osd dump -f json | \
  python3 -c 'import sys,json; print(json.load(sys.stdin)["crush_node_flags"])'
# {}
```

Leaving `noout` set is the quiet failure mode here: the cluster looks healthy but
will not react to a later disk failure on that host.

## 7. If the host does not come back

```bash
ceph orch host maintenance exit <host> --force --offline
```

This clears the maintenance state for a host cephadm cannot reach, so the
cluster stops waiting on it. It does not remove `noout`, which is what you want:
the host is still expected back. If it is not coming back, drop `noout`
deliberately so redundancy is restored:

```bash
ceph osd unset-group noout <host>
```

and then follow [replace-host.md](replace-host.md).

---

## Related

- [replace-disk.md](replace-disk.md) - the disk swap this usually wraps, including
  the `replace-osd.yml` rebuild once the new disk is in
- [replace-host.md](replace-host.md) - when the node is not coming back
- [remote-hands-access.md](remote-hands-access.md) - getting a human to the machine

## Note on the reprovision path

`roles/reprovision_hetzner/tasks/ceph_safety.yml` gates a node the other way: its
own `ok-to-stop` check followed by per-OSD `ceph osd add-noout`. That is correct
for reprovisioning, where the host is about to be wiped and the systemd target
does not survive anyway. It is the wrong tool for a power-off-and-return, because
it leaves the target enabled and the host status unset. Use this runbook for
anything the node is expected to come back from.
