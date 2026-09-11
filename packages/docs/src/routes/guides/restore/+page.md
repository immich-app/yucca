---
title: Restoring files
description: Get files back from a snapshot, roll an Immich server back, or rebuild a machine from scratch
order: 4
---

There are three ways to get data back, depending on how much you lost.

## Restoring some files

Open the backup, find the snapshot you want in **Snapshots**, and choose **Restore files** from its menu.

In the **Restore Backup** window:

- **Files to restore.** Leave it empty to restore everything in the snapshot, or select **Select files instead** and pick individual files and folders by browsing inside the snapshot.
- **In-place restore** is on by default and puts files back exactly where they came from. Turn it off to choose a **Target** folder instead.

Select **Restore** and a progress window opens, the same as for a backup.

> [!WARNING]
> An in-place restore overwrites the current version of those files. If you are not certain, restore to a different folder and compare before replacing anything.

When you restore to a target folder, the original directory structure is recreated underneath it. A file backed up from `/target/photos/holiday.jpg` restored into `/target/scratch` lands at `/target/scratch/target/photos/holiday.jpg`.

### If restore fails with a permissions error

If you mounted your data read-only with `:ro`, an in-place restore cannot write to it and will fail. Either restore to a writable folder instead, or remove `:ro` from that mount and restart the container.

## Rolling an Immich server back

Immich can go back to how it was at a chosen snapshot. On the snapshot, choose **Rollback snapshot**.

This restores your files **and** the Immich database, and restarts the server as part of the process. Immich goes into maintenance mode while it runs. Anything added after that snapshot was taken is gone once it completes, so treat it as a last resort rather than a way to undo one deletion.

## Rebuilding a machine

If the machine is gone, the backups are not. They are on your account, encrypted with your [recovery key](/guides/recovery-key).

1. Install the app again, following [Immich](/getting-started/immich) or [the standalone container](/getting-started/standalone).
2. When setup offers to create a key, choose **Import key** and enter your existing recovery key instead.
3. Connect the same FUTO Backups account.
4. Your existing backups appear. If one shows "Can't access, is your recovery key correct?", the imported key is not the one that made it.
5. Pick the backup, then the snapshot you want, and confirm.

The confirmation screen lists what the snapshot contains and lets you untick parts of it. It also offers to restore the **backup configuration** itself, which brings back the backup definitions and schedules that machine had, so you do not have to set them up again. Files are restored to their original paths.

## Things restore does not do yet

- There is no preview of what will be overwritten before you start.
- There is no way to download a single file from the web dashboard. Restoring into a folder is the way to pull one file out.
- A restore in progress cannot be cancelled from the interface.
- Snapshot deletion is immediate and permanent, with no recycle bin.
