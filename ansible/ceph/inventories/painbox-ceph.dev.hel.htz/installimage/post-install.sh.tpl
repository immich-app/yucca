#!/bin/bash
# Post-install script for SX295 Ceph node (painbox)
# Runs in chroot after Hetzner installimage completes.
#
# Sets up: LVM for block.db + SSD OSD, SSH keys, cephadm prereqs
# Does NOT: touch SATA drives, deploy Ceph (that's Ansible's job)
#
# RENDER BEFORE USE:
#   op inject -f -i post-install.sh.tpl -o /tmp/post-install.sh.rendered
# Then upload the rendered file to the rescue system. See
# docs/runbooks/painbox-reprovision.md.
#
# The rendered script authorizes only the ansible-iac pubkey fetched live
# from 1P — rotations propagate at reprovision time without a template edit.

set -euo pipefail
set -x

echo "=== post-install: starting ==="

# --- SSH authorized keys ---
mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys << 'SSHKEYS'
op://yucca_tf_dev/PAINBOX_CEPH_ANSIBLE_IAC_SSH_KEY/public_key
SSHKEYS
chmod 600 /root/.ssh/authorized_keys

# --- System packages ---
apt-get update -qq
apt-get install -y -qq \
    lvm2 \
    python3 \
    python3-pip \
    curl \
    jq \
    smartmontools \
    chrony \
    podman \
    bzip2

# --- NVMe RAID-1 LVM for Ceph ---
# After installimage, the NVMe RAID-1 has:
#   md0 = /boot (1G)
#   md1 = LVM PV for vg0 (rest of NVMe)
#   vg0 = swap(32G) + root(100G) + var(200G) + varlog(50G)
#
# Remaining space in vg0: ~7.28 TiB - 382 GiB = ~5.53 TiB free
# Allocate: 14 x 128 GiB block.db LVs + leave 0.5 TiB reserve + rest for SSD OSD

echo "=== post-install: creating block.db LVs ==="

if ! vgs vg0 &>/dev/null; then
    echo "FATAL: vg0 not found. Check installimage partition config."
    exit 1
fi

for i in $(seq 0 13); do
    lvcreate --yes -Wy -L 128G -n db-slot${i} vg0
    echo "  created vg0/db-slot${i} (128 GiB)"
done

# SSD OSD: allocate all remaining space minus 512 GiB reserve
VG_FREE_GIB=$(vgs vg0 --noheadings --nosuffix --units g -o vg_free | tr -d ' ' | cut -d. -f1)
RESERVE_GIB=512
OSD_GIB=$((VG_FREE_GIB - RESERVE_GIB))

if [ "$OSD_GIB" -gt 0 ]; then
    lvcreate --yes -Wy -L "${OSD_GIB}G" -n ssd-osd vg0
    echo "  created vg0/ssd-osd (${OSD_GIB} GiB, ${RESERVE_GIB} GiB reserved)"
else
    echo "  WARNING: not enough space for SSD OSD LV"
fi

echo "=== post-install: LVM layout ==="
lvs vg0 -o lv_name,lv_size --noheadings

# --- Timezone ---
ln -sf /usr/share/zoneinfo/UTC /etc/localtime

# --- Sysctl tuning for Ceph ---
cat > /etc/sysctl.d/90-ceph.conf << 'SYSCTL'
# Ceph OSD tuning
vm.min_free_kbytes = 1048576
vm.swappiness = 10
net.core.rmem_max = 67108864
net.core.wmem_max = 67108864
SYSCTL

echo "=== post-install: complete ==="
