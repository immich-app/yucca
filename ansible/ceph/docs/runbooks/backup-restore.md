# Runbook: Backup and Restore

**When:** Before major operations (upgrades, topology changes), on a
regular schedule, or during disaster recovery.

**Time estimate:** Backup: 2 minutes. Restore: depends on scenario.

---

## Backup

### Run a backup

```bash
mise run backup
```

Or directly:

```bash
scripts/ansible-play.sh backup-config.yml
```

### What gets captured

Backups are written to `backups/<timestamp>/` on the Ansible controller
(gitignored). Each backup contains:

| File | Contents |
|---|---|
| `ceph.conf` | Minimal cluster config (fsid, mon_host, auth settings) |
| `ceph.client.admin.keyring` | Admin authentication keyring |
| `crushmap.txt` | Decompiled CRUSH map (host/OSD topology and rules) |
| `osd-dump.json` | Full OSD map: pool definitions, PG counts, flags, weights |
| `mon-dump.json` | Monitor map: mon addresses, quorum members |
| `config-dump.json` | All runtime config overrides (`ceph config dump`) |
| `rgw-realm.json` | RGW realm, zonegroup, and zone configuration |
| `orch-services.yaml` | cephadm service specs (RGW, monitoring, crash, etc.) |
| `orch-hosts.yaml` | Cluster host list with addresses and labels |

### Backup schedule

No automated schedule is configured. Run manually:

- Before any cluster topology change (add/remove node or OSD)
- Before Ceph version upgrades
- Before CRUSH map modifications
- Weekly during active development

### Verify a backup

```bash
ls -la backups/$(ls -t backups/ | head -1)/
```

Check that all files are present and non-empty. The admin keyring and
ceph.conf are the most critical -- without them, cluster access is lost.

---

## Restore Scenarios

### Scenario 1: Lost ceph.conf / admin keyring on a single node

**Cause:** Accidental deletion, failed re-provision.

**Fix:** cephadm automatically distributes ceph.conf and the admin keyring
to managed hosts. Force redistribution:

```bash
# From bootstrap node
ceph cephadm config-check enable
ceph orch host rescan <hostname>
```

Or manually copy from the backup:

```bash
scp backups/<timestamp>/ceph.conf ansible-iac@<host>:/etc/ceph/ceph.conf
scp backups/<timestamp>/ceph.client.admin.keyring ansible-iac@<host>:/etc/ceph/ceph.client.admin.keyring
```

### Scenario 2: Lost admin keyring on ALL nodes

**Cause:** Full cluster purge without backup, or corruption.

**Fix:** Restore the keyring from the backup to the bootstrap node:

```bash
scp backups/<timestamp>/ceph.client.admin.keyring \
  ansible-iac@sietch-ceph-laurel:/etc/ceph/

ssh ansible-iac@sietch-ceph-laurel
sudo chmod 600 /etc/ceph/ceph.client.admin.keyring
sudo chown ceph:ceph /etc/ceph/ceph.client.admin.keyring
```

Verify access is restored:

```bash
ceph status
```

### Scenario 3: CRUSH map corruption

**Cause:** Bad CRUSH rule edit, accidental tunables change.

**Fix:** Restore the CRUSH map from backup:

```bash
# Compile the decompiled map
crushtool -c backups/<timestamp>/crushmap.txt -o /tmp/crushmap.bin

# Inject it
ceph osd setcrushmap -i /tmp/crushmap.bin
```

**WARNING:** This overwrites the entire CRUSH topology. Any OSDs added
since the backup was taken will not be in the restored map.

### Scenario 4: RGW realm/zone misconfiguration

**Cause:** Bad radosgw-admin command, zone placement errors.

**Fix:** Use the backup as a reference to reconstruct:

```bash
cat backups/<timestamp>/rgw-realm.json | python3 -m json.tool
```

Then re-apply zone placement targets, zonegroup hostnames, etc. using
`radosgw-admin zone set` / `radosgw-admin zonegroup set` with the JSON
from the backup piped in.

### Scenario 5: Full cluster rebuild (total loss)

**Cause:** All nodes destroyed, starting from scratch.

1. Re-provision all nodes (see add-node runbook)
2. Run the full deploy pipeline:

```bash
mise run deploy
```

3. Restore configuration from backup:

```bash
# After bootstrap, apply saved CRUSH map
crushtool -c backups/<timestamp>/crushmap.txt -o /tmp/crushmap.bin
ceph osd setcrushmap -i /tmp/crushmap.bin

# Re-apply runtime config overrides
# Review config-dump.json and apply relevant settings
cat backups/<timestamp>/config-dump.json | python3 -c "
import sys, json
for item in json.load(sys.stdin):
    section = item.get('section', 'global')
    name = item.get('name', '')
    value = item.get('value', '')
    if name and section != 'mds':
        print(f'ceph config set {section} {name} {value}')
"
```

**Note:** Object data (S3 objects, bucket contents) is stored on the OSDs
and cannot be restored from this config backup. This backup only preserves
cluster metadata and configuration. For data protection, rely on Ceph's
built-in replication (size=2+) and erasure coding.

### Scenario 6: Restore service specs after cephadm reset

```bash
ceph orch apply -i backups/<timestamp>/orch-services.yaml
```

This re-deploys RGW, monitoring, and crash daemons with the saved
placement and configuration.
