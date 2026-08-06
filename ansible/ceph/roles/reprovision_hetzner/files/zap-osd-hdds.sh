#!/bin/bash
# Runs in the Hetzner RESCUE ramdisk before installimage: leftover ceph LVM /
# bluestore / LUKS signatures make `ceph orch apply osd` skip the disks.
# Targets ALL SATA disks; NEVER the NVMe OS disks (installimage's SWRAID owns
# those). Idempotent.
#
# Running in rescue (not a live node) sidesteps the LUKS-lock problem: a fresh
# rescue never opens the dmcrypt mappings, so wipefs can clear the headers
# directly. The crypt/dm cleanup below is defensive (a re-run mid-flight).
set -uo pipefail
echo "=== zap-osd-hdds: starting ==="

# Defensive: close any active dm-crypt/LUKS mappings (they lock devices vs wipefs).
for dm in $(dmsetup ls --target crypt 2>/dev/null | awk 'NF && $1 !~ /No devices/ {print $1}'); do
  echo "closing LUKS: $dm"
  cryptsetup close "$dm" 2>/dev/null || dmsetup remove -f "$dm" 2>/dev/null || true
done
for dm in $(dmsetup ls 2>/dev/null | grep -i ceph | awk '{print $1}'); do
  echo "removing dm: $dm"
  dmsetup remove -f "$dm" 2>/dev/null || true
done

# Tear down any ceph LVM the rescue auto-activated from old OSDs.
for vg in $(vgs --noheadings -o vg_name 2>/dev/null | grep -i ceph | tr -d ' '); do
  echo "removing vg: $vg"
  vgchange -an "$vg" 2>/dev/null || true
  vgremove -ff "$vg" 2>/dev/null || true
done

# Select by rotational type + size, NOT /dev/sdN, so the BMC 0-byte
# "Virtual HDisk0" and the NVMe OS disks are excluded automatically.
MIN_BYTES=1000000000000   # 1 TB floor
mapfile -t DISKS < <(lsblk -dbn -o NAME,SIZE,ROTA,TYPE | awk -v m="$MIN_BYTES" '$4=="disk" && $3==1 && $2+0>=m+0 {print "/dev/"$1}')
echo "OSD HDD targets: ${DISKS[*]:-<none>}"
rc=0
for dev in "${DISKS[@]}"; do
  for vg in $(pvs --noheadings -o vg_name "$dev" 2>/dev/null | awk 'NF'); do
    vgchange -an "$vg" 2>/dev/null || true
    vgremove -ff "$vg" 2>/dev/null || true
  done
  pvremove -ff -y "$dev" 2>/dev/null || true
  if ! wipefs -af "$dev"; then echo "wipefs-failed: $dev" >&2; rc=1; continue; fi
  sgdisk -Z "$dev" 2>/dev/null || true
  # bluestore stamps its label in the first block; wipefs does not know the
  # format, so zero the first 10 MB of the disk directly.
  if ! dd if=/dev/zero of="$dev" bs=1M count=10 conv=fsync status=none; then
    echo "dd-failed: $dev" >&2; rc=1; continue
  fi
  echo "zapped: $dev"
done
echo "=== zap-osd-hdds: done (rc=$rc) ==="
exit "$rc"
