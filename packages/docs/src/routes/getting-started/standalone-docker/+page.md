---
title: Standalone container
description: Run FUTO Backups as a single self-hosted container on your homelab machine with Docker or Compose
order: 1
---

The standalone app is a self-hosted, single-container FUTO Backups orchestrator for a homelab machine.

> [!NOTE]
> The user interface for the standalone app is unpolished and may have some rough edges.

> [!WARNING]
> The app has no authentication, take care when exposing any ports.

Run using Docker:

```bash
docker run -d --name futo-backups \
  --restart always \
  -p 127.0.0.1:22676:22676 \
  -v "$HOME/.yucca:/data" \
  -v /my/important/data:/target/important-data:ro \
  ghcr.io/immich-app/futo-backups-standalone:v0
```

Then head to http://localhost:22676.

> [!NOTE]
> Use `-v futo-backups-data:/data` instead if you want a named volume.

> [!NOTE]
> If you wish to also restore files, remove the `:ro` annotation.

> [!NOTE]
> If you'd like to configure local backups/backend, add additional volumes: `-v /mnt/my-external-drive:/backends/my-local-destination`

Or create a compose file:

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

Then run:

```bash
docker compose pull
docker compose up -d
# run both again to update
```
