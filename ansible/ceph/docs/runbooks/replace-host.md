# Runbook: Replace a Host (Hardware Swap, Preserving Name)

**When:** chassis failure, motherboard swap, or preventative hardware
refresh. You want the new box to assume the old host's identity — same
hostname, same IP, same Ceph OSD identities.

**Time estimate:** 1-2 hours (bare-metal) / 30 min (Hetzner).

---

## Preserving name = preserving trust

Keeping the old hostname avoids:
- Re-issuing the ansible-iac SSH key to a new hostname
- Rotating the host's Ceph auth keys
- Updating monitoring dashboards / alert rules with new labels
- Updating any external systems that refer to the hostname

The TF inventory declaration stays unchanged — cluster name, host name,
bond IP all match. Only the physical box changes.

## Steps

### 1. Mark OSDs out, wait for backfill

```bash
# SSH to bootstrap node
sudo ceph osd out $(sudo ceph osd ls-tree <hostname-being-replaced>)
sudo ceph -w   # watch for HEALTH_OK or acceptable degraded state
```

Depending on cluster size, full backfill can take hours. For time-critical
replacements, skip this step and accept degraded state during rebuild —
but confirm you have headroom.

### 2. Power down old host, rack new one in same slot

Preserve the physical network cabling and IPMI address. The new box gets
the same bond IP via the same DHCP reservation / static config.

### 3. Re-run provisioning against the new host

**Bare-metal (sietch)**:

```bash
# Boot the new box from the Debian 12 live image (same procedure as first
# provision — see docs/runbooks/add-node.md for iDRAC steps).

CEPH_ENV=inventories/staging-austin/sietch/inventory-provision.ini \
  scripts/ansible-play.sh provision.yml \
  -e confirm_wipe=true \
  --limit sietch-ceph-<name>
```

**Hetzner (NVMe-RAID host)**: reboot into rescue, run installimage +
post-install scripts from the cluster's `inventories/<cluster>/installimage/`.

### 4. Clear the old host's Ceph state

The cluster still has the old host's OSDs, CRUSH entries, and cephadm
host record. Clean those up BEFORE the new box rejoins:

```bash
# On bootstrap node:
for osd in $(sudo ceph osd ls-tree <hostname>); do
  sudo ceph osd purge $osd --yes-i-really-mean-it
done
sudo ceph osd crush remove <hostname>
sudo ceph orch host rm <hostname> --force
```

### 5. Re-run baseline + deploy for that host

```bash
scripts/ansible-play.sh baseline.yml --limit <hostname>
scripts/ansible-play.sh deploy-ceph.yml \
  --limit <hostname>,<bootstrap-hostname>
```

Note bootstrap host must be in `--limit` — join/placement/OSD activation
all run from bootstrap.

### 6. Verify

```bash
# All OSDs for the replaced host are up+in
sudo ceph osd tree | grep <hostname>

# Cluster is rebalancing or healthy
sudo ceph -s
```

## Gotchas

- **Hardware topology changed**: new chassis may have different PCI paths
  for SAS controllers / NVMe. Update `host_vars/<hostname>.yml`
  (`sas_path_prefix`, `ceph_hdd_osds`) before step 5.
- **Different serial numbers**: acceptable — `by-path` is used for OSD
  slot identity, not `by-id`.
- **Backfill thundering herd**: if you skipped step 1, the new OSDs enter
  the cluster and backfill aggressively. Throttle with
  `ceph_osd_recovery_max_active` in vars.yml if you see client-IO impact.

## References

- `docs/runbooks/add-node.md` — related but for net-new hosts
- `docs/runbooks/replace-disk.md` — single-disk replacement within a host
