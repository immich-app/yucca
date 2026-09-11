---
title: Join the beta
description: What you need before you start, and how to get a FUTO Backups account during the closed beta
order: 1
---

FUTO Backups is in a closed beta. Accounts are invite-only, so the first step is getting an invite and signing in at [backups.futo.cloud](https://backups.futo.cloud).

## What you need

- **An invite.** Invites are handed out in the FUTO Backups channels on the [Immich Discord](https://discord.immich.app). See below.
- **Somewhere to run the backup app.** Either an [Immich](/getting-started/immich) server, or any machine that runs Docker for the [standalone container](/getting-started/standalone). You can use both against the same account.
- **A few minutes for setup.** The app walks you through connecting your account, saving a recovery key and running a first backup.

## Getting an invite

Invites are given out in Discord, in two ways:

- **A personal invite.** The bot sends you a direct message with your invite link.
- **A claim button.** A post in one of the FUTO Backups channels carries a **Claim your invite** button. Click it and the bot replies with your own link. Once the batch runs out the button changes to *All invites claimed*.

Either way you end up with a link to `backups.futo.cloud`. Open it and you will see a message like "you're invited to the FUTO Backups beta. Sign in to join", with a **Join the beta** button. Follow it and sign in.

> [!NOTE]
> Invite links are single-use and expire after 10 minutes. If yours has expired, the page tells you so. Go back to Discord and claim a new one.

If you were given an invite **code** instead of a link, go to [backups.futo.cloud](https://backups.futo.cloud), enter the code when asked and select **Continue**.

## Signing in

Signing in uses your FUTO account. Once you are in, you land on your dashboard, which lists the machines connected to your account and how much storage you are using.

If you try to sign in without an invite you will see "Your email isn't part of the beta yet." Claim an invite first.

## Next

Install the backup app where your data lives:

- [Set up in Immich](/getting-started/immich) if you want to back up an Immich library.
- [Set up the standalone container](/getting-started/standalone) to back up folders on any machine that runs Docker.
