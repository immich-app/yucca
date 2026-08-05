#!/bin/bash
# Clear stale mdraid metadata on ANY disk + fully wipe the OS NVMes, in rescue
# BEFORE installimage. WHY: installimage names the new RAID rescue:0/1; stale
# superblocks with the SAME names elsewhere (stor-test boxes carried RAID on the
# SATA HDDs) give the initramfs duplicate array names -> root never assembles,
# node never comes back. HOW: mdadm --zero-superblock is silently reverted while
# an array is assembled, so stop-loop until /proc/mdstat is empty, then raw dd at
# BOTH ends of each member (metadata 1.2 front, 1.0 tail) + wipefs, re-stopping
# per member. SAFETY: superblock clearing only touches devices that carry one
# (no-op on the LVM bluestore HDDs); the vgremove/pvremove/sgdisk wipe is
# OS-NVMe-only. NOT data-preserving on the NVMe-RAID shape: vg0 holds every
# block.db + the ssd-osd LV, so a reimage DESTROYS all OSDs on the node --
# ceph_safety.yml (ok-to-stop) must clear it first. Mirrors provision_host/tasks/disks.yml.
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
