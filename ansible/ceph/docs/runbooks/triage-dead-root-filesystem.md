# Runbook: Triage a Host Whose Root Filesystem Has Died

**When:** A node stops responding to cephadm, its OSDs all drop at once, and SSH
still connects but commands fail with `Input/output error`. On the SX295 fleet
this means the NVMe pair behind `vg0` is gone, which takes the OS, all 14
`block.db` LVs and the SSD OSD with it (see [hardware.md](../hardware.md)).

**Time estimate:** 15 minutes to a defensible diagnosis.

**Prerequisites:**
- `spice-ceph` CLI working from your workstation (see [scripts.md](../scripts.md))
- SSH to the node (`spice-ceph-<name>` over WAN, or `fabric-spice-ceph-<name>`
  over the mgmt VLAN)
- Read access to the cluster's prometheus/alertmanager on a mon host

**Do not reboot the node until you have finished section 3.** A reboot is the
fastest way to destroy the only evidence you still have.

---

## 0. The tell

```
$ ssh spice-ceph-philip 'cat /proc/mdstat'
bash: line 1: /usr/bin/cat: Input/output error
```

sshd is alive because it was already resident. Anything that needs a fresh read
from disk fails. The host is running entirely out of page cache and is not
coming back on its own.

## 1. Blast radius, from the cluster side first

Do this before touching the node. It is fast, it cannot make things worse, and
it tells you whether you are looking at one host or several.

```bash
spice-ceph health detail          # named health checks, with the failing host in the text
spice-ceph -s                     # osds up/in, degraded PG count, recovery rate
spice-ceph osd tree down          # exactly which OSDs, grouped by host
spice-ceph crash ls-new
spice-ceph crash info <crash-id>  # assert_func tells you the failure class
spice-ceph osd metadata <id>      # devices / bluefs_db_devices for a single bad OSD
```

A whole host reads as a contiguous block in `osd tree down`. A single OSD with
`KernelDevice::_aio_thread()` in `crash info` is a device error on that one
disk, which is a different problem with a different runbook
([replace-disk.md](replace-disk.md)).

Two things that will mislead you here:

- **`OSD_DOWN` and `OSD_HOST_DOWN` clear themselves.** The mon marks the OSDs
  `out` after `mon_osd_down_out_interval` (600s), both health checks go away,
  and alertmanager sends a *Resolved*. The host is still dead. Expect the alert
  history to show a 10-minute fire-and-resolve and nothing after.
- **`CEPHADM_FAILED_DAEMON` may name a different host.** cephadm cannot refresh
  a host it cannot reach, so the dead node shows up as
  `CEPHADM_HOST_CHECK_FAILED` / `CEPHADM_REFRESH_FAILED` instead, and
  `CEPHADM_FAILED_DAEMON` is whatever unrelated daemon happens to be broken.

## 2. What alerted vs what is true

From any mon host. Prometheus is on `:9095`, alertmanager on `:9093`.

```bash
# what alertmanager currently holds, including whether something is silenced
curl -s http://localhost:9093/api/v2/alerts | python3 -m json.tool | less

# what prometheus thinks is firing right now
curl -s 'http://localhost:9095/api/v1/query?query=ALERTS'

# does a rule for this condition even exist? (grep the name you saw in health detail)
curl -s http://localhost:9095/api/v1/rules \
  | python3 -c 'import sys,json
for g in json.load(sys.stdin)["data"]["groups"]:
    for r in g["rules"]:
        if r.get("type")=="alerting": print(r["name"], "|", r["query"][:90])'
```

To turn a health check into a timeline, range-query `ceph_health_detail` and
collapse it into on/off windows. That is how you find out that `OSD_DOWN` ran
for exactly ten minutes:

```bash
curl -sG http://localhost:9095/api/v1/query_range \
  --data-urlencode 'query=ceph_health_detail' \
  --data-urlencode "start=$(( $(date -u +%s) - 32400 ))" \
  --data-urlencode "end=$(date -u +%s)" \
  --data-urlencode 'step=120'
```

Worth checking while you are here, because nothing alerts on it:

```bash
# a degraded RAID1 -- no rule covers this, you have to look
curl -s 'http://localhost:9095/api/v1/query?query=node_md_disks_required - on(device,instance) node_md_disks{state="active"} > 0'
```

## 3. On the host: you only have what is in RAM

SSH in and assume every external binary is gone. What still works:

**procfs and sysfs reads, via bash redirection.** These never touch the disk.
`$(<file)` is a builtin, `cat` is not.

```bash
echo "$(</proc/mdstat)"                 # RAID state
echo "$(</proc/uptime)"                 # has it rebooted, or has it been rotting?
echo "$(</proc/mounts)"                 # what is still mounted, and ro vs rw
echo "$(</proc/partitions)"             # which block devices the kernel still sees
echo "$(</proc/sys/kernel/hostname)"    # confirm which box you are actually on
```

**Globs, to check whether device nodes survived.** If the glob comes back
unexpanded, the devices are gone from the bus entirely:

```bash
for d in /dev/nvme*; do echo "$d"; done
```

**The kernel ring buffer, via the `read` builtin.** `dmesg` and `journalctl`
will both be dead. `/dev/kmsg` is readable directly, and `read -t` is a builtin,
so this works when nothing else does. Pull it to your workstation and filter it
there, where you still have real tools:

```bash
ssh <host> 'bash -c "exec 3</dev/kmsg; while read -t 2 -r l <&3; do echo \"\$l\"; done"' \
  > /tmp/<host>-kmsg.txt
grep -inE 'nvme|pcie|md/raid1|Buffer I/O|EXT4-fs|critical medium|AER' /tmp/<host>-kmsg.txt
```

**Whatever binaries happen to still be cached.** This is a lottery and you
cannot predict the winners, so just try them. On philip `/bin/ls`, `/bin/sed`
and `/usr/sbin/mdadm` still ran while `cat`, `dmesg` and `journalctl` did not.
If `mdadm` survives it is the single most useful thing on the box:

```bash
/usr/sbin/mdadm --detail /dev/md1
```

Read the member table, not just the summary line. `/proc/mdstat` showing `[2/1]
[U_]` looks like an ordinary degraded mirror, but `mdadm --detail` showing
`State : clean, FAILED` with the surviving member listed as `active sync
missing` means both device nodes are gone and there is no good half left. That
is the difference between "swap a disk" and "the controller dropped off".

### The ring buffer will have wrapped

Check how far back it actually reaches before you trust it:

```bash
# first field of the oldest line is microseconds since boot; compare to /proc/uptime
head -1 /tmp/<host>-kmsg.txt
```

On philip the buffer held 5170 messages covering only the last **2.1 hours** of
a 499-hour uptime, so the original NVMe/PCIe failure messages were already gone
five hours after the event. Two things evict them: the EXT4 error storm the
failure itself produces, and `nftables-drop` logging from the security role,
which fills the buffer continuously with internet background noise. Capture
kmsg early or accept that you will not get the root-cause line.

## 4. Concluding

You have enough for a hardware ticket when you can state:

- which device nodes are missing (`/dev/nvme*` glob unexpanded)
- the array state from `mdadm --detail` (`FAILED`, not merely degraded)
- the `Update Time` on the array, which is the moment of failure
- the OSD list from `spice-ceph osd tree down`
- that the filesystem errors are consequences (`EXT4-fs error ... Detected
  aborted journal` on the `vg0` LVs), not the cause

spice has no IPMI and one shared KVM, so anything past this point is a Hetzner
ticket -- see [remote-hands-access.md](remote-hands-access.md). Once the
hardware is replaced the node is a reprovision, not a repair:
[replace-host.md](replace-host.md).

Leave the OSDs alone while you wait. They are already marked `out` and the
cluster is backfilling; purging them only creates a second data movement for no
benefit.
