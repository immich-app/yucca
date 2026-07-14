#!/bin/bash
# Clear stale mdraid metadata (from a previous install, on ANY disk) and fully
# wipe the OS NVMe disks, in the Hetzner rescue ramdisk BEFORE installimage.
#
# WHY: installimage's new NVMe RAID is auto-named rescue:0 / rescue:1. If a previous
# install left mdraid superblocks with the SAME names on OTHER disks (the stor-test
# boxes carried RAID across the SATA HDDs), the installed OS's initramfs sees
# DUPLICATE array names, cannot assemble root at boot, and never comes back on the
# network. So stale superblocks must be cleared on EVERY disk.
#
# HOW (robust): mdadm --zero-superblock is silently reverted while an array is still
# assembled, so we (1) stop arrays in a loop until /proc/mdstat is empty, and
# (2) zero the superblock regions with RAW dd at BOTH ends of each member (metadata
# 1.2 at the front, 1.0 at the tail) - raw writes cannot be refused by a live array -
# plus wipefs, re-stopping after each member in case a degraded array re-assembles.
#
# SAFETY: the mdraid-superblock clearing only touches devices that ACTUALLY carry a
# superblock (a no-op on the bluestore OSD HDDs, which are LVM with no mdraid). The
# extra destructive wipe (vgremove/pvremove/sgdisk/partprobe) is OS-NVMe-only.
#
# DO NOT read this as "a reimage preserves OSDs". On the NVMe-RAID shape (spice) the
# HDD OSD block.db LVs AND the ssd-osd data LV live on the OS NVMe (vg0) this script
# zeroes, so a reimage DESTROYS every OSD on the node even though the HDD data
# devices themselves are untouched (an OSD is unusable once its block.db is gone).
# The tasks/ceph_safety.yml gate must clear the node (ceph osd ok-to-stop) first.
# Mirrors provision_host/tasks/disks.yml.
set -uo pipefail
echo "=== prepare-os-disks: starting ==="

# LVM/dmcrypt holders keep the md arrays busy ("mdadm --stop" fails, and writes to
# the members get EBUSY). Drop them first, or nothing below can zero the superblocks.
echo "--- deactivate LVM + drop device-mapper holders ---"
for dm in $(dmsetup ls --target crypt 2>/dev/null | awk 'NF && $1 !~ /No devices/{print $1}'); do
  cryptsetup close "$dm" 2>/dev/null || dmsetup remove -f "$dm" 2>/dev/null || true
done
for vg in $(vgs --noheadings -o vg_name 2>/dev/null | awk 'NF'); do
  vgchange -an "$vg" 2>/dev/null || true
done
dmsetup remove_all 2>/dev/null || true

stop_all_md() {
  for _ in 1 2 3 4 5; do
    mdadm --stop --scan 2>/dev/null || true
    # shellcheck disable=SC2013  # md device names never contain spaces
    for m in $(awk '/^md/{print "/dev/"$1}' /proc/mdstat 2>/dev/null); do
      mdadm --stop "$m" 2>/dev/null || true
    done
    grep -q '^md' /proc/mdstat 2>/dev/null || return 0
    sleep 1
  done
}
all_block() { lsblk -pnro NAME,TYPE | awk '$2=="disk" || $2=="part"{print $1}'; }
has_md()    { mdadm --examine "$1" 2>/dev/null | grep -q 'Magic'; }

zero_ends() {  # raw-zero first + last 16 MB of a device
  local dev="$1" sz
  sz=$(blockdev --getsize64 "$dev" 2>/dev/null || echo 0)
  dd if=/dev/zero of="$dev" bs=1M count=16 conv=fsync status=none 2>/dev/null || true
  if [ "$sz" -gt 33554432 ]; then
    dd if=/dev/zero of="$dev" bs=1M count=16 seek=$(( sz / 1048576 - 16 )) conv=fsync status=none 2>/dev/null || true
  fi
}

echo "--- stop all mdraid arrays ---"
stop_all_md

echo "--- clear mdraid superblocks on every md member (raw dd, both ends) ---"
z=0
for dev in $(all_block); do
  has_md "$dev" || continue
  mdadm --zero-superblock --force "$dev" 2>/dev/null || true
  zero_ends "$dev"
  wipefs -af "$dev" 2>/dev/null || true
  echo "  cleared: $dev"
  z=$((z + 1))
done
echo "--- cleared $z md member(s) ---"

# OS NVMe: give installimage a fresh partition table.
mapfile -t NV < <(lsblk -dn -o NAME,TYPE | awk '$2=="disk" && $1 ~ /^nvme/{print "/dev/"$1}')
echo "--- OS NVMe disks: ${NV[*]:-<none>} ---"
[ "${#NV[@]}" -gt 0 ] || { echo "FATAL: no NVMe OS disks found"; exit 1; }
for d in "${NV[@]}"; do
  for p in "$d" "${d}"p*; do
    [ -b "$p" ] || continue
    for vg in $(pvs --noheadings -o vg_name "$p" 2>/dev/null | awk 'NF'); do
      vgchange -an "$vg" 2>/dev/null || true
      vgremove -ff "$vg" 2>/dev/null || true
    done
    pvremove -ff -y "$p" 2>/dev/null || true
  done
  zero_ends "$d"
  wipefs -af "$d" 2>/dev/null || true
  sgdisk -Z "$d" 2>/dev/null || true
  partprobe "$d" 2>/dev/null || true
  echo "  nvme wiped: $d"
done

echo "--- settle udev + clear mdadm assemble cache ---"
stop_all_md
udevadm settle --timeout=10 2>/dev/null || true
rm -f /run/mdadm/map /run/mdadm/autorebuild.pid 2>/dev/null || true
partprobe 2>/dev/null || true
stop_all_md

echo "--- residual mdraid superblocks (must be none) ---"
resid=0
for dev in $(all_block); do
  has_md "$dev" && { echo "STALE superblock: $dev"; resid=1; }
done
[ "$resid" -eq 0 ] && echo "clean: no mdraid superblocks remain on any disk"
echo "=== prepare-os-disks: done (residual=$resid) ==="
exit "$resid"
