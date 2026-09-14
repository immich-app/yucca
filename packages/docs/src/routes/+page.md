---
title: FUTO Backups
description: Encrypted, off-site backups for your Immich library or any machine you run, hosted by FUTO
---

FUTO Backups keeps a copy of your data on storage that FUTO runs, so it survives the disk, the machine and the building it normally lives in.

Everything is encrypted on your own machine before it is uploaded, with a key that never leaves you. We store your backups. We cannot read them.

## Two ways to use it

- **In Immich.** Back up your photo library, its database and, if you want, its thumbnails and encoded videos. Managed from the Immich admin interface. See [set up in Immich](/getting-started/immich).
- **As a standalone container.** Back up any folders on any machine that runs Docker, with or without Immich. See [set up the standalone container](/getting-started/standalone).

You can use both against the same account.

## What to expect from the beta

FUTO Backups is in a closed, invite-only beta, and it is free while it is.

Backups and restores work, and are the parts we most want tested. Around them you will find unfinished corners: placeholder figures on the dashboard, wording that mentions Immich when it should not, and settings that are not connected yet. [Troubleshooting](/help/troubleshooting) lists the ones we know about.

Please tell us what you find. [Getting help](/help/support) explains how to open a ticket.

> [!IMPORTANT]
> During setup you are given a recovery key. It is the only thing that can decrypt your backups, and FUTO does not have a copy. Save it somewhere safe before you go any further. See [your recovery key](/guides/recovery-key).

## Start here

1. [Join the beta](/getting-started/beta) and sign in to your account.
2. Set up [Immich](/getting-started/immich) or the [standalone container](/getting-started/standalone).
3. Follow [your first backup](/getting-started/first-backup) from end to end.
4. Set a [schedule](/guides/schedules) so it keeps happening.

Then, before you ever need it, read [restoring files](/guides/restore).
