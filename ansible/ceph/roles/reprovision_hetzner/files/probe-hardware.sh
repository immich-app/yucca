#!/bin/bash
# Report hardware for the pre-wipe check, classifying disks by ROTA (type) + SIZE -
# the same way sietch's provision_host/detect.yml picks its disks - so the BMC 0-byte
# "Virtual HDisk0" and any /dev/sdN reordering never skew the counts. Emits 3 lines:
#   bios|uefi
#   <count of OS disks>   (non-rotational, >= floor - the NVMe)
#   <count of OSD disks>  (rotational,     >= floor - the SATA HDDs)
MIN_BYTES="${1:-1000000000000}"   # 1 TB floor: excludes the 0-byte virtual media + small boot devices
[ -d /sys/firmware/efi ] && echo uefi || echo bios
lsblk -dbn -o SIZE,ROTA,TYPE | awk -v m="$MIN_BYTES" '$3=="disk" && $1+0>=m+0 && $2==0 {n++} END{print n+0}'
lsblk -dbn -o SIZE,ROTA,TYPE | awk -v m="$MIN_BYTES" '$3=="disk" && $1+0>=m+0 && $2==1 {n++} END{print n+0}'
