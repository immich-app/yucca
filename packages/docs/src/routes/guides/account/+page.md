---
title: Your account and storage
description: What the web dashboard shows, how connections work, and what storage costs during the beta
order: 5
---

[backups.futo.cloud](https://backups.futo.cloud) is where you see everything backing up to your account. The backups themselves are set up and run on your own machines, not here.

## Dashboard

**Your Backups** summarises how your backups are doing, with a bar splitting them into successful, with warnings, failed and never run. **Recent backups** lists the last few runs.

The four figures across the middle are:

| Figure | What it means |
| --- | --- |
| Avg. Backup Time | The average duration of the most recent run of each backup |
| Daily Backup Time | Those same durations added together |
| Total Stored | How much storage your backups are using, measured on our side |
| Current Usage | A placeholder. It is not showing you a real number yet |

Where a backup has not been measured on our side yet, its size is shown as **Estimated**, taken from what your machine reported. The measured figure updates every few minutes.

## Backups

**Backups** lists every backup on your account with its size and last result.

This page is deliberately read-only apart from deleting. Creating backups, choosing folders, running them and restoring all happen in the app on the machine itself, because that is where your files and your encryption key are.

## Connections

A **connection** is one thing that backs up to your account. An Immich server is a connection. A machine running the standalone container is another. One account can have as many as you like, and each is listed with how many backups it holds and how much storage it uses.

Connections appear on their own when you connect a machine, named after that machine's hostname. Connecting the same machine again reuses the connection rather than making a second one. There is nothing to create or configure here.

## What it costs

FUTO Backups is free while it is in the closed beta. There is no plan, no quota and no charge, and nothing in the app will ask you for payment.

The dashboard still shows what your usage would be billed as, so the figures mean something later. One detail worth knowing: for the standalone app, each stored object counts as at least 1 MiB. Immich backups are counted at their real size. Very small files therefore look larger in the billed figure than they are on disk.

## Where your data is stored

Backups are stored on FUTO's own hardware in Falkenstein, Germany. There is no region to choose.

Your files are encrypted on your machine before they are uploaded, using a key that stays with you. See [your recovery key](/guides/recovery-key).

## Signing out

**Logout** is in the top right. Signing out of the website does not affect your machines; they stay connected and keep backing up.
