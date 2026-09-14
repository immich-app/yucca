---
title: Your first backup
description: Connect your account, save your recovery key and get one backup finished from end to end
order: 4
---

Once the app is installed, setup takes three things: connecting your account, saving your recovery key, and creating a backup. This page covers all three.

Immich asks you to connect your account first and shows the recovery key after. The standalone app does it the other way round. Either way you do both.

## Connect your account

The **Connect your FUTO account** step links the machine to the account you signed up with.

1. Select **Connect account**. The app shows a short code, above the words "You may be asked or shown the following code".
2. Select **Continue to login**. A popup window opens on the FUTO sign-in page.
3. Sign in, check that the code shown matches the one in the app, and approve.
4. The app shows "Waiting for you to confirm login" until it picks up the approval, then carries on by itself.

If the popup is blocked, allow popups for the app and select **Try again**. There is a copy button next to the code if you need it.

> [!NOTE]
> The standalone app also offers **Use local storage**, which stores backups on a disk you mount into the container instead of on FUTO's storage. You can add that later as well. See [where backups are stored](/guides/backups#where-backups-are-stored).

## Save your recovery key

You are shown a 64-character key and asked to confirm "I saved my recovery key somewhere safe" before you can continue.

**Do not skip past this.** Your backups are encrypted with this key before they leave your machine, and FUTO does not have a copy. Without it, your backups cannot be read by anyone, including you. Use the **Copy recovery key**, **Download** or **Print** buttons and put it somewhere you will still have it if this machine dies.

[Your recovery key](/guides/recovery-key) explains what it protects and how to use it later.

## Create a backup

In Immich this is done for you: setup finishes with a first backup of your library, and you can adjust what it includes afterwards under [Backup Contents](/getting-started/immich).

In the standalone app, create one yourself:

1. Go to **Backups** and select **Create new backup**.
2. Give it a **Name**. This is just a label, so use something you will recognise later, like "Documents" or "Photos".
3. Leave **Write once (WORM)** off unless you want it. It stops anything ever being deleted from this backup, including by you, and it cannot simply be switched off again afterwards.
4. Select create. The app immediately opens **Configure**, where you choose what to back up.
5. Under **Backup Paths**, select **Add first path** and browse to the folders you mounted, usually under `/target`. Add as many as you want.
6. Save.

## Run it

Open the backup's menu and select **Back up now**.

A window shows the progress: "Preparing backup", then "Backing up" with a percentage, then "Finalizing backup". You can close it and the backup carries on in the background.

When it finishes you get one of:

- **Your library was backed up successfully**
- **Your library was backed up, with warnings**, with the warnings listed
- **Your library could not be backed up**, with a **Try again** button. Nothing is changed in your existing backups when a backup fails

The first backup uploads everything and can take a long time. Later backups only send what changed, so they are much faster.

## Check it worked

The dashboard shows **Your Backups** with a health bar, and **Recent backups** listing what has run. Open a backup to see its **Snapshots**, which is one entry per successful run, and **Recent backup attempts** for its history.

You can also sign in at [backups.futo.cloud](https://backups.futo.cloud) and see the machine listed against your account.

## Next

- [Set a schedule](/guides/schedules) so backups keep running without you.
- [Restoring files](/guides/restore), worth reading once before you need it.
