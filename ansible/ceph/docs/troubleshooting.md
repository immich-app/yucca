# Troubleshooting Guide

Decision-tree format: symptom, diagnosis, fix.

---

## Cluster Health

### HEALTH_WARN

#### Symptom: `HEALTH_WARN: N osds down`

**Diagnose:**

```bash
ceph osd tree | grep down
ceph health detail
```

**Common causes and fixes:**

1. **OSD daemon crashed** -- check logs:

```bash
ceph crash ls-new
ceph crash info <crash-id>
# Or on the host:
journalctl -u ceph-osd@<id> --since "1 hour ago"
```

Restart the daemon:

```bash
ceph orch daemon restart osd.<id>
```

2. **Host unreachable** -- the node itself is down:

```bash
ssh ansible-iac@sietch-ceph-<name> hostname
# If unreachable, check iDRAC / physical console
```

3. **Disk failure** -- see the [replace-disk runbook](runbooks/replace-disk.md).

4. **OSD out of disk space** -- check nearfull/full ratios:

```bash
ceph osd df
```

---

#### Symptom: `HEALTH_WARN: N pgs not active+clean`

**Diagnose:**

```bash
ceph pg stat
ceph pg dump_stuck
```

**Common causes and fixes:**

1. **Backfill in progress** -- normal after adding/removing OSDs. Monitor:

```bash
ceph -s
```

Wait for completion. No action needed.

2. **Stale PGs** -- PGs stuck in `stale` state:

```bash
ceph pg dump_stuck stale
```

Usually indicates the hosting OSD is down. Fix the OSD first.

3. **Inactive PGs** -- PGs in `creating` or `peering`:

```bash
ceph pg dump_stuck inactive
```

If stuck for >15 minutes, check MON logs. May need `ceph pg force-create-pg <pgid>`.

---

#### Symptom: `HEALTH_WARN: clock skew detected`

**Diagnose:**

```bash
ceph time-sync-status
# On each node:
chronyc tracking
```

**Fix:** Restart chrony on the affected node:

```bash
sudo systemctl restart chrony
```

If persistent, check NTP sources:

```bash
chronyc sources -v
```

---

#### Symptom: `HEALTH_WARN: N daemons have recently crashed`

**Diagnose:**

```bash
ceph crash ls-new
ceph crash info <crash-id>
```

**Fix:** Review the crash, then archive it:

```bash
ceph crash archive <crash-id>
# Or archive all:
ceph crash archive-all
```

If crashes are recurring, investigate the daemon logs on the host.

---

#### Symptom: `HEALTH_WARN: N pool(s) have no replicas configured`

**Diagnose:**

```bash
ceph osd pool ls detail | grep 'size 1'
```

**Fix:** Set appropriate replication:

```bash
ceph osd pool set <pool> size 2
ceph osd pool set <pool> min_size 1
```

---

### HEALTH_ERR

#### Symptom: `HEALTH_ERR: N pgs are stuck inactive`

**Diagnose:**

```bash
ceph pg dump_stuck inactive
ceph osd tree
```

**Fix:** This is critical -- data may be inaccessible.

1. Check if the hosting OSDs are down. Bring them up first.
2. If OSDs are permanently lost and data cannot be recovered:

```bash
# DANGER: marks missing PGs as complete with potential data loss
ceph pg force-recovery <pgid>
# Last resort:
ceph osd force-create-pg <pgid> --yes-i-really-mean-it
```

---

#### Symptom: `HEALTH_ERR: N scrub errors`

**Diagnose:**

```bash
ceph health detail
# Find the affected PGs
ceph pg dump | grep inconsistent
# Deep scrub the PG
ceph pg deep-scrub <pgid>
```

**Fix:**

```bash
ceph pg repair <pgid>
```

If repair fails, the underlying disk may have bit rot. Check SMART data on
the hosting OSDs.

---

#### Symptom: `HEALTH_ERR: full osds`

**Diagnose:**

```bash
ceph osd df
ceph df
```

**Fix:** This is an emergency. The cluster stops accepting writes.

1. Delete unnecessary data or pools if possible
2. Temporarily raise the full ratio:

```bash
ceph osd set-full-ratio 0.97
```

3. Add more OSDs (see [add-node runbook](runbooks/add-node.md))
4. Set the ratio back after capacity is restored:

```bash
ceph osd set-full-ratio 0.95
```

---

## OSD Issues

### Symptom: OSD down and won't start

**Diagnose:**

```bash
# Check daemon status
ceph orch ps --daemon-type osd | grep <host>

# Check container logs
ssh ansible-iac@<host>
sudo podman logs ceph-<fsid>-osd.<id>
sudo journalctl -u ceph-<fsid>@osd.<id>
```

**Common causes:**

1. **LUKS key missing** -- dmcrypt key not in MON store:

```bash
ceph config-key dump | grep dm-crypt | grep <osd-id>
```

If missing, the OSD cannot be unlocked. Rebuild it (see replace-disk
runbook).

2. **Corrupt BlueStore DB** -- look for `fsck` errors in the OSD log.
   May need `ceph-bluestore-tool repair`.

3. **Block device disappeared** -- check the SAS path:

```bash
ls /dev/disk/by-path/ | grep phy<N>
```

If missing, the disk or cable has failed.

---

### Symptom: Slow ops / blocked requests

**Diagnose:**

```bash
ceph daemon osd.<id> dump_ops_in_flight
ceph daemon osd.<id> perf dump | grep -i slow
```

**Common causes:**

1. **Disk latency** -- check I/O wait:

```bash
iostat -xz 5 3
```

Look for `%util > 90%` or `await > 100ms` on HDD devices.

2. **Network issues** -- check for packet loss:

```bash
ping -c 100 <other-node-ip>
ethtool -S eno1 | grep -i error
```

3. **Recovery throttling too aggressive** -- reduce recovery impact:

```bash
ceph config set osd osd_recovery_max_active 1
ceph config set osd osd_max_backfills 1
ceph config set osd osd_recovery_sleep_hdd 0.1
```

---

## RGW (S3) Issues

### Symptom: S3 requests return 403 Forbidden / SignatureDoesNotMatch

**Diagnose:**

```bash
# Check if the Host header hostname is in the zonegroup
radosgw-admin zonegroup get --rgw-zonegroup=us-east-1 | python3 -c "
import sys, json
zg = json.load(sys.stdin)
print('Hostnames:', zg.get('hostnames', []))
print('API name:', zg.get('api_name'))
"
```

**Common causes:**

1. **Missing hostname in zonegroup** -- the Host header used by the client
   is not in the zonegroup's hostnames list. S3 signature verification
   includes the Host header, so mismatches cause 403.

Fix:

```bash
# Re-run the RGW role to add all node hostnames/IPs
scripts/ansible-play.sh deploy-ceph.yml --tags rgw \
  --limit sietch-ceph-laurel
```

2. **Wrong access/secret key** -- verify credentials:

```bash
radosgw-admin user info --uid=svc-yucca-restic
```

3. **Clock skew** -- S3 signatures are time-sensitive. Check client and
   server clocks are within 15 minutes.

---

### Symptom: S3 requests return 500 Internal Server Error

**Diagnose:**

```bash
# Check RGW daemon logs
ceph log last 50 --channel=cluster | grep rgw

# Check if RGW daemons are running
ceph orch ls --service-type rgw
ceph orch ps --daemon-type rgw
```

**Common causes:**

1. **RGW daemons down** -- restart:

```bash
ceph orch restart rgw
```

2. **Pool issues** -- check that RGW pools exist and are healthy:

```bash
ceph osd pool ls | grep rgw
ceph pg stat
```

3. **TLS cert expired or corrupted** -- see
   [rotate-certs runbook](runbooks/rotate-certs.md).

---

### Symptom: Dashboard Object Gateway page shows 500 or is empty

**Diagnose:**

```bash
# Check dashboard RGW API SSL verification setting
ceph dashboard get-rgw-api-ssl-verify

# Check dashboard RGW user has caps
radosgw-admin user info --uid=dashboard | python3 -c "
import sys, json
u = json.load(sys.stdin)
print('Caps:', u.get('caps', []))
print('System:', u.get('system'))
"
```

**Fix:**

1. Disable SSL verification (self-signed certs):

```bash
ceph dashboard set-rgw-api-ssl-verify false
```

2. Add admin caps to dashboard user:

```bash
radosgw-admin caps add --uid=dashboard \
  --caps='buckets=*;users=*;usage=*;metadata=*;zone=*'
```

3. Sync dashboard credentials:

```bash
ceph dashboard set-rgw-credentials
```

---

## Dashboard Issues

### Symptom: Dashboard unreachable at https://<ip>:8443

**Diagnose:**

```bash
# Check MGR daemon status
ceph orch ps --daemon-type mgr

# Check which MGR is active
ceph mgr stat

# Check dashboard module is enabled
ceph mgr module ls --format json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('dashboard' in d.get('enabled_modules', []))
"
```

**Fix:**

1. **MGR daemon down** -- restart:

```bash
ceph orch restart mgr
```

2. **Dashboard module disabled**:

```bash
ceph mgr module enable dashboard
```

3. **Firewall blocking port 8443** -- check nftables:

```bash
ssh ansible-iac@<host> sudo nft list ruleset | grep 8443
```

If the port is not open, re-run security hardening:

```bash
scripts/ansible-play.sh harden.yml
```

4. **Wrong IP/port** -- check dashboard URL:

```bash
ceph mgr services
```

---

## Deploy Issues

### Symptom: `mise run deploy` fails — `no available installation candidate for cephadm=20.2.*`

**Cause:** apt cache is stale. `prerequisites.yml` adds the Ceph Tentacle
repo (`download.ceph.com/debian-tentacle`) and then runs `apt update`.
On a freshly-installed OS (Hetzner installimage runs apt internally),
the cache is "fresh" enough that an `apt update` with `cache_valid_time`
set will skip the refresh — apt never sees the Ceph repo's Packages file
and only knows about Debian's older `cephadm 16.2.x`.

**Diagnose:** SSH to the target node and run:

```bash
cat /etc/apt/sources.list.d/ceph.list   # confirm the repo file exists
apt-cache policy cephadm                # if download.ceph.com is missing, cache is stale
apt-get update                          # manual refresh
apt-cache policy cephadm                # should now show 20.2.x candidate
```

**Fix:** `tasks/prerequisites.yml` was patched to drop `cache_valid_time`
on the apt-update task; refresh is unconditional after the repo is
added. If you're seeing this on a node that ran the OLD prerequisites
task (cached deploy state), `apt update` manually then re-run deploy.

---

### Symptom: `mise run deploy` fails — `'ceph_rgw_dns_name' is undefined`

**Cause:** the per-cluster `group_vars/all/vars.yml` is missing the
`ceph_rgw_dns_name` declaration. RGW zonegroup creation needs it for
the `--endpoints` and master zonegroup hostname.

**Fix:** add to `inventories/<cluster>/group_vars/all/vars.yml`:

```yaml
ceph_rgw_dns_name: s3.{{ cluster_domain }}
```

This derives the DNS name from `cluster_domain` (e.g.
`s3.dev.austin.int.futo.cloud`). Sietch defines this explicitly. New
clusters should include it from the start — see
[docs/adding-a-cluster.md](adding-a-cluster.md) group_vars template.

---

### Symptom: `HEALTH_WARN: OSDMAP_FLAGS: noin flag(s) set` after deploy

**Cause:** the `noin` flag was set by an earlier failed run of the
older imperative OSD-creation flow and never unset. The current
spec-based flow doesn't set `noin` (cephadm rolls out OSDs gracefully)
and includes a defensive unset task at the tail of `osds.yml`, but the
flag can persist if the deploy never reached that tail (e.g., a failure
in an earlier phase).

**Fix:** clear it manually, or just re-run `mise run deploy` — the
defensive task at the end of `tasks/osds.yml` unsets `noin`
unconditionally (idempotent no-op when already unset):

```bash
ssh -i ~/.ssh/id_ed25519_<cluster> root@<bootstrap-ip> 'ceph osd unset noin'
```

Validate:

```bash
ceph osd dump | grep -E "^flags"
# Should NOT contain 'noin'. Default healthy: sortbitwise,recovery_deletes,purged_snapdirs,pglog_hardlimit
```

---

## Provisioning Issues

### Symptom: provision.yml fails with "REFUSING TO RUN"

**Cause:** Missing safety flag.

**Fix:**

```bash
CEPH_ENV=<inventory> scripts/ansible-play.sh provision.yml \
  -e confirm_wipe=true
```

---

### Symptom: Provisioning fails at debootstrap / chroot phase

**Diagnose:** Check which task failed in the Ansible output. The rescue
block automatically unmounts `/mnt`, so it's safe to re-run.

**Common causes:**

1. **apt sources unreachable from live image** -- check network
   connectivity from the live image. DNS resolution and internet access
   are required for debootstrap.

2. **Disk detection failed** -- SSD not found at expected path:

```bash
ls /dev/disk/by-path/ | grep sas
lsblk
```

3. **Previous partial provision** -- the role is idempotent. If the
   provisioning marker exists at `/mnt/etc/ceph-provisioned.json`, all
   chroot phases are skipped. To force re-provision, boot into the live
   image and re-run.

---

### Symptom: Post-reboot SSH fails after provisioning

**Diagnose:**

```bash
# Try with verbose SSH
ssh -vvv -i ~/.ssh/id_ed25519_sietch ansible-iac@sietch-ceph-<name>
```

**Common causes:**

1. **Node still booting** -- R730xd POST takes 60-90 seconds. Wait and
   retry.

2. **SSH host key changed** -- fresh provision generates new host keys:

```bash
ssh-keygen -R sietch-ceph-<name>
```

3. **Network not up** -- bond interface may not have configured. Check
   via iDRAC virtual console.

4. **Wrong IP** -- verify `bond_ip` in host_vars matches the actual
   network config.

---

## SSH Connectivity

### Symptom: Cannot SSH to cluster nodes from controller

**Diagnose:**

```bash
# Test SSH to a node directly
ssh ansible-iac@10.10.10.90 hostname

# If using a jump host, verify it's reachable (check your ~/.ssh/config)
ssh <jump-host> hostname
```

**Common causes:**

1. **SSH config issue** -- if nodes are behind a jump host, verify your
   `~/.ssh/config` has the correct ProxyJump or ProxyCommand settings.
   This is personal config, not managed by the repo.

2. **Wrong SSH key** -- inventory uses `~/.ssh/id_ed25519_sietch`:

```bash
ls -la ~/.ssh/id_ed25519_sietch*
```

3. **sntrup761 kex hang** -- cephadm's asyncssh does not support
   post-quantum key exchange. The baseline role deploys
   `/etc/ssh/sshd_config.d/no-sntrup.conf` to disable it. If missing:

```bash
scripts/ansible-play.sh deploy-ceph.yml \
  --tags prerequisites --limit sietch-ceph-<name>,sietch-ceph-laurel
```

4. **nftables blocking SSH** -- verify port 22 is allowed:

```bash
# From the node (via iDRAC console if SSH is blocked)
nft list ruleset | grep 22
```

---

## Quick Health Check Commands

```bash
# Overall status
ceph status

# OSD health
ceph osd tree
ceph osd df

# PG health
ceph pg stat
ceph pg dump_stuck

# Services
ceph orch ls
ceph orch ps

# Recent crashes
ceph crash ls-new

# Drift from expected config
mise run drift

# Cluster capacity
ceph df
```
