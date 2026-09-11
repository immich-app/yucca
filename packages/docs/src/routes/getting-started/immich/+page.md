---
title: Set up in Immich
description: Switch your Immich server to the beta build, turn on backups and choose what gets backed up
order: 2
---

Immich has FUTO Backups built in. It backs up your photos and videos, your database and, if you want them, your thumbnails and encoded videos, straight to storage FUTO runs. You need to be an **administrator** of the Immich server.

> [!CAUTION]
> The Immich integration is not in a stable Immich release yet. Following these steps moves your server onto a development build of Immich, which can contain changes that are not finished. Take a backup of your existing Immich data before you start, and do not do this on a server you cannot afford to break.

Before you begin, make sure you have [joined the beta](/getting-started/beta) and can sign in at [backups.futo.cloud](https://backups.futo.cloud).

## 1. Switch to the beta build

Set the Immich version to the backups feature branch in your Immich deployment's environment file:

```bash
# .env
IMMICH_VERSION=pr-27817
```

Then pull and restart:

```bash
docker compose pull
docker compose up -d
```

Run both commands again whenever you want to pick up newer changes to the branch.

> [!NOTE]
> This image is built from an open pull request rather than a release, and it also carries recent changes from Immich's development branch. A new image appears only when that branch builds successfully, so it can lag behind the latest work on the pull request.

## 2. Turn on backups

The feature is off by default and there is no switch for it in the admin settings. Open this address on your Immich server, signed in as an administrator, replacing the host with your own:

```
https://immich.example.com/link?target=backups
```

That turns the feature on and takes you to the backups page. From then on the page lives at `/admin/backups`, and you can also reach it from the button in the admin sidebar.

## 3. Run through setup

The first time you open the page you get an introduction to FUTO Backups with a **Get Started** button. After that the setup runs in a few short steps:

1. **Telemetry.** The closed beta requires diagnostic data, so this step has no decline option and cannot be turned off later. Your photos, files and recovery key are never collected.
2. **Connect FUTO account.** This links the Immich server to the account you signed up with.
3. **Save your recovery key.** Your backups are encrypted with this key and FUTO cannot recover it for you. Read [your recovery key](/guides/recovery-key) before you click past this screen.
4. **Start your first backup.**

## 4. Choose what gets backed up

Open **Backup Contents** on the backups page to pick what each backup includes.

| Content | What it is | Notes |
| --- | --- | --- |
| Photos and videos | Your media uploaded directly to Immich | Strongly recommended |
| Database and metadata | Albums, people, tags, favourites and other library details | Always included, required to restore |
| Thumbnails and previews | Generated photo previews | Can be left out and regenerated after a restore |
| Encoded videos | Generated video previews | Can be left out and regenerated after a restore |
| External libraries | Libraries stored outside Immich | All, none, or specific libraries |

Leaving thumbnails or encoded videos out makes backups smaller and faster. After a restore you will see broken previews until you regenerate them from the admin panel.

There is also a **Backup configuration** switch, which includes these backup settings themselves so they survive a restore.

## 5. Set a schedule

Open **Schedule** and turn on **Run backups automatically**. You choose a frequency of daily, weekly or monthly and a start time on the hour. The default is daily at 03:00.

## 6. Choose how long backups are kept

Open **Storage** to set **Delete old backups**. The default keeps 60 days. You can choose 15, 30, 60 or 90 days, keep only the latest two backups, or keep everything forever.

Old backups are removed automatically after each run. If you turned on write-once protection for the backup, nothing can be deleted and this setting is fixed to never.

## Next

- [Your recovery key](/guides/recovery-key), which is the one thing you must not lose.
- [Restoring files](/guides/restore), including rolling your whole Immich instance back to a snapshot.
