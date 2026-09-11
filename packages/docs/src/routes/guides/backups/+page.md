---
title: Managing backups
description: Change what a backup covers, see its snapshots, add storage, and import backups made by another machine
order: 2
---

A backup is a named set of folders, a place to store them, and the history of everything that has been sent there. You can have several on one machine, for example one for documents and one for photos.

In the standalone app they live under **Backups**. In Immich there is a single backup of your library, managed from the backups page.

## Changing what is backed up

Open the backup's menu and select **Configure**. You can rename it, and under **Backup Paths** add or remove folders. Changes apply to the next run.

Only paths you mounted into the container are visible. If a folder you want is not there, add another `-v` mount and restart the container. See [setting up the standalone container](/getting-started/standalone#what-to-mount).

There is no exclude or ignore list yet, so a backup covers everything under the paths you pick.

In Immich you choose categories rather than paths, under **Backup Contents**. See [setting up in Immich](/getting-started/immich#4-choose-what-gets-backed-up).

## Snapshots

Each successful run adds a **snapshot**, a point-in-time copy you can restore from. Open a backup to see the list, newest first, with its size and the folders it covers.

Runs only upload what changed since last time, so snapshots share storage rather than each costing a full copy.

Below the snapshots, **Recent backup attempts** lists every run, successful or not, and **View Log** on any of them reopens its progress and errors.

## Where backups are stored

Open **Configure** in the sidebar to see **Storage backends**, the places this machine can send backups. There are two:

- **FUTO Backups**, hosted storage on your account. Add it with **Login with FUTO Backups**, which uses the same approve-in-a-browser flow as first setup. No settings to fill in.
- **Local Storage**, a folder on this machine. Add it with **New local storage** and pick a path. Mount the disk into the container first, by convention under `/backends`.

New backups use the first backend configured. Each backup shows the storage it uses, with a status of Online, Active, Offline or Missing on service.

> [!NOTE]
> Storing backups only on a local disk in the same machine protects you from mistakes and corruption, but not from fire, theft or that disk failing. Treat it as a complement to hosted storage rather than a replacement.

## Write once backups

**Write once (WORM)** stops anything ever being removed from a backup, including by you and including automatic clean-up of old snapshots. It is set when the backup is created.

Turning it off later is deliberately awkward: the app sends you to [backups.futo.cloud](https://backups.futo.cloud) to confirm, on a page headed **Confirm Action**, because it weakens a protection you chose on purpose.

## Backups made by another machine

If a backup already exists on your storage but not on this machine, it appears under **Backups found elsewhere**. This happens after a rebuild, or when you point a second machine at the same account.

Select **Import** on it. The app checks it can read the backup first and shows either "Repository is readable and accessible!" or "Can't read repository." If it cannot be read, the machine almost certainly has the wrong [recovery key](/guides/recovery-key). After importing, the Configure dialog opens so you can check the name and paths.

Backups stored on a local folder show as **Unknown** until they are imported, because the name is only stored inside the app.

## Deleting a backup

**Delete repository** in the backup's menu opens [backups.futo.cloud](https://backups.futo.cloud) to confirm, since it removes the stored data permanently. Individual snapshots can be deleted from the snapshot list instead, which is also permanent.

Deleting is only offered for backups stored on FUTO Backups.

## Sizes

Backups stored on FUTO Backups report a measured size. Backups on a local folder show an **Estimated** size worked out on the machine instead, because local storage does not report usage back.
