---
title: Getting help
description: How to reach the FUTO Backups team during the beta, and what to include when you report a problem
order: 2
---

Support for the beta runs through Discord, in the **FUTO Backups** channels on the [Immich Discord](https://discord.immich.app).

## Channels

| Channel | What it is for |
| --- | --- |
| `#support` | Opening a support ticket. The pinned message carries the button that starts one |
| `#general` | General FUTO Backups chat |
| `#customer` | Chat for people with a FUTO Backups account |

## Opening a ticket

Support tickets are private threads, so you can share details without posting them to the whole server.

1. Go to `#support` and select **Get support** on the pinned message.
2. The first time you do this, the bot sends you a one-time link to connect your Discord account to your FUTO Backups account. Follow it, sign in and confirm. You only do this once.
3. Describe your issue in the box the bot shows you.
4. The bot opens a private thread with you and the support team, seeded with your description.

Keep the conversation in that thread. It stays private to you and the team.

## What to include

The more of this you can give, the faster a ticket moves:

- Whether you are using **Immich** or the **standalone container**, and which version or image tag.
- What you expected to happen and what happened instead.
- The name of the backup involved, and roughly when it ran.
- Anything from the backup's own log. In the app, open the backup and look under **Recent backup attempts** for the failed run.

> [!TIP]
> If a backup failed, say whether it has ever succeeded. "It has never worked" and "it worked until Tuesday" lead to very different first questions.

## Reporting a bug

If you are confident something is a bug rather than a configuration problem, an issue on the [yucca repository](https://github.com/immich-app/yucca/issues) is welcome too. Support tickets are still the fastest route during the beta, because the team can look at your account alongside the report.

## Before you write in

The [troubleshooting page](/help/troubleshooting) covers the problems that come up most often, including a backup that will not start, a machine that will not connect to your account and what to do about a lost recovery key.
