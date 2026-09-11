---
title: Set up the standalone container
description: Run FUTO Backups as a single Docker container and back up folders from any machine
order: 3
---

The standalone app is a single container that backs up folders from the machine it runs on. Use it for a homelab server, a NAS or a desktop, with or without Immich.

> [!NOTE]
> The interface for the standalone app is unpolished and has some rough edges. You are seeing it early because the beta is early.

Before you begin, make sure you have [joined the beta](/getting-started/beta) and can sign in at [backups.futo.cloud](https://backups.futo.cloud).

## Run it

```bash
docker run -d --name futo-backups \
  --restart always \
  -p 127.0.0.1:22676:22676 \
  -v "$HOME/.yucca:/data" \
  -v /my/important/data:/target/important-data:ro \
  ghcr.io/immich-app/futo-backups-standalone:v0
```

Then open http://localhost:22676.

Or with Compose:

```yaml
# compose.yml
name: futo-backups

services:
  backups:
    image: ghcr.io/immich-app/futo-backups-standalone:v0
    ports:
      - 127.0.0.1:22676:22676
    volumes:
      - data:/data
      # add additional mounts for the data you want to backup
      - /my/important/data:/target/important-data:ro
    restart: always

volumes:
  data:
    name: futo-backups-data
```

```bash
docker compose pull
docker compose up -d
```

## What to mount

| Mount | Purpose |
| --- | --- |
| `/data` | The app's own state: its database, settings and your encryption key. Never delete this volume |
| `/target/...` | The data you want backed up. Add one mount per folder |
| `/backends/...` | Optional. A local disk to store backups on, such as an external drive |

The app can only see what you mount into it, so add a `-v` line for every folder you want to back up. The names under `/target` are yours to choose. When you pick folders in the app you will browse to them there.

> [!WARNING]
> The example mounts your data read-only with `:ro`. That is the safe default and backups work fine, but restoring files back to their original location will fail. Drop `:ro` if you want to restore in place. You can always restore to a different folder instead.

If you would rather keep the app's state in a named volume than a folder in your home directory, use `-v futo-backups-data:/data`.

> [!CAUTION]
> Deleting the `/data` volume does not just reset your settings. Your encryption key lives there, and without it your existing backups can never be read again, wherever they are stored. Save your [recovery key](/guides/recovery-key) somewhere outside the container as soon as setup gives it to you.

## Ports and access

The container listens on port 22676. The examples bind it to `127.0.0.1`, so it is reachable only from the machine it runs on. That is deliberate: **the app has no password of its own until you connect a FUTO Backups account**, and anyone who can reach the port before then can configure it.

Once an account is connected, the app requires you to be signed in. If you need to turn that off, set `YUCCA_DISABLE_AUTH=true`, but then do not expose the port beyond localhost.

To reach the app from another machine, put it behind something that provides authentication, such as a reverse proxy or a VPN, rather than publishing the port directly.

## First run

Open the app and it walks you through setup. Some of the wording mentions Immich and a subscription even when you are not using either. That is a known rough edge; the steps still apply.



1. **Telemetry.** The closed beta requires diagnostic data, so this step has no decline option and cannot be turned off later. Your files and your recovery key are never collected.
2. **Save your recovery key.** Your backups are encrypted with it and FUTO cannot recover it for you. Read [your recovery key](/guides/recovery-key) before continuing.
3. **Connect your FUTO account.** This is where your backups will be stored.

After that you land on the dashboard, with **Backups**, **Schedules** and **Configure** in the sidebar.

## Updating

```bash
docker compose pull
docker compose up -d
```

Run both again each time you want to update. With plain `docker run`, pull the image and recreate the container.

## Next

- [Your first backup](/getting-started/first-backup) walks through creating one and running it.
- [Your recovery key](/guides/recovery-key), which is the one thing you must not lose.
