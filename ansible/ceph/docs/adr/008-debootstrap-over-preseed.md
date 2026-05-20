# ADR-008: debootstrap from Live Image over Preseed/Autoinstall

## Status

Accepted

## Context

Austin nodes are bare-metal Dell servers that need Debian 12 installed from
scratch. The standard approaches are:

- **Preseed/Autoinstall** -- unattended Debian installer driven by a preseed
  file. Requires PXE boot infrastructure or a custom ISO. The installer is a
  black box: partition layout is expressed in preseed's declarative syntax,
  which cannot handle our complex disk layout (mdraid-1 across two SSDs,
  5 partitions per SSD for ESP/boot/swap/root/ceph-db, plus SSD OSD
  partitions).
- **debootstrap from a live image** -- boot a Debian live USB, run
  `debootstrap` to install the base OS into a prepared mount point. Full
  scripting control over partitioning, mdraid, LVM, and chroot configuration.

Our disk layout requires:

1. Detecting exactly 2 SSDs by model pattern, validating they are non-rotational
   and above a minimum size.
2. GPT partitioning with 5-6 partitions per SSD (ESP, boot, swap, root LVM,
   ceph block.db, ceph SSD OSD).
3. mdraid-1 mirrors across matching partitions on both SSDs.
4. LVM on the root mdraid for flexible volume management.

Preseed cannot express step 1 (hardware validation with abort-on-failure) or
step 2 (partition 5-6 reserved for Ceph with specific sizes). Custom
partitioning in preseed uses `partman` recipes, which are notoriously fragile
and poorly documented for non-standard layouts.

## Decision

We boot nodes from a Debian 12 live image (USB stick via iDRAC virtual media),
then run the `provision_host` role via Ansible. The role:

1. Validates the live-image environment (UEFI, correct SSDs, sizes, non-rotational).
2. Partitions, creates mdraid arrays, sets up LVM -- all via shell commands
   with full error handling and idempotency guards.
3. Runs `debootstrap --arch amd64 bookworm /mnt` to install the base OS.
4. Templates hostname, hosts, network, fstab, mdadm.conf inside the chroot.
5. Installs packages, creates the `ansible-iac` user, installs GRUB.
6. Writes a provisioning marker, mirrors the ESP, and reboots.

The entire process has block/rescue error handling: on failure, bind mounts
are cleaned up so the next run starts clean. A marker file makes completed
provisioning idempotent -- re-running skips directly to unmount and reboot.

## Consequences

- **Positive:** Full scripting control over disk layout. Complex partitioning,
  mdraid, and multi-purpose SSD partitions are straightforward shell commands,
  not preseed recipes.
- **Positive:** Hardware validation before any destructive operation. The role
  aborts if SSDs don't match expectations (wrong model, too small, rotational).
- **Positive:** Idempotent with marker-driven resume. Partially failed runs
  can be safely retried.
- **Negative:** Requires a live-image boot mechanism (iDRAC virtual media or
  physical USB). Cannot provision purely over the network without PXE.
- **Negative:** More Ansible code to maintain than a preseed file. Justified
  by the disk layout complexity that preseed cannot express.
