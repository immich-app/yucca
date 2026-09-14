---
title: Troubleshooting
description: What the common errors mean and what to do about them
order: 1
---

## Setup and sign-in

**"Login was cancelled or timed out."**
The usual cause is closing the popup or letting it sit too long. Select **Try again**. If it keeps happening, note that this message is also what you get when your account is not part of the beta yet, so check you can sign in at [backups.futo.cloud](https://backups.futo.cloud) first.

**"That account does not own this instance. Log in with the account it was connected with."**
This machine was connected using a different account. Sign in with that one.

**"This instance is not connected to a FUTO Backups account yet."**
Setup did not finish. Run through **Connect account** again.

**"Could not reach FUTO Backups. Check your connection."**
The machine cannot reach our servers. Check its internet connection, DNS and any firewall or proxy in the way.

**"Your email isn't part of the beta yet."**
You signed in with an address that has no invite. Claim an invite in Discord and use the link it gives you. See [join the beta](/getting-started/beta).

**"Something went wrong. We ran into an error setting up backups"**
The app failed to start properly. Check the container logs. Note that Docker may still report the container as healthy, because the health check only tests that the web server answers.

## Backups

**A backup fails immediately with "Task already running!"**
One backup at a time per backup job. Wait for the running one to finish. This also happens when a scheduled run starts while the previous one is still going, in which case that run is recorded as failed and the next one will be fine.

**A scheduled backup did not run.**
Schedules have no catch-up. If the machine was off or the container was not running when the schedule was due, that run is skipped rather than run late. Also check the schedule is not paused, and remember that the standalone app runs schedules in [UTC](/guides/schedules).

**The folder I want is not in the file picker.**
The app can only see paths mounted into the container. Add another `-v` mount and restart it. See [what to mount](/getting-started/standalone#what-to-mount).

**A backup is listed as "Unknown".**
That is a backup found on storage that this machine has not imported yet. Use **Import** on it. See [backups made by another machine](/guides/backups#backups-made-by-another-machine).

**The size says "Estimated".**
The size your machine calculated, shown because we have not measured it on our side yet. Measured sizes update every few minutes, and only for backups stored on FUTO Backups.

**"Can't access, is your recovery key correct?" or "Can't read repository."**
The app cannot decrypt that backup, which nearly always means the recovery key on this machine is not the one that created it. Import the correct key. See [your recovery key](/guides/recovery-key).

## Restoring

**A restore fails with a permissions error.**
If you mounted the folder read-only with `:ro`, files cannot be written back to it. Restore to a different folder, or remove `:ro` from the mount and restart the container.

**I want one file back, not all of them.**
In the restore window, choose **Select files instead** and pick just what you need. There is no per-file download from the website.

**I started a restore by mistake.**
There is no cancel button for a running restore yet. Let it finish, then restore the correct version over the top.

## Things that look broken but are not finished

The beta ships some interface that is not wired up yet. If you find these, they are known:

- **Current Usage** on the dashboard always shows a dash rather than a figure.
- **Setup on Immich** on the dashboard does nothing when clicked.
- Setup wording sometimes mentions Immich and a subscription even in the standalone app.

## Still stuck

Open a support ticket in Discord. [Getting help](/help/support) explains how and what to include.
