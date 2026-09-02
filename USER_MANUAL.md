<!-- AGENTS/CLAUDE note: This document is hand-written, NEVER automatically update this file. Always prompt the user to change it if needed. -->

# FUTO Backups Manual

## On your homelab

### Using the standalone Docker container

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

### Using in Immich

You can currently use the feature branch directly by using the following version in your Immich deployment:

```bash
# .env
IMMICH_VERSION=pr-27817
```

Then run:

```bash
docker compose pull
docker compose up -d
# run both again to update
```

> [!CAUTION]
> This will bump you to the latest<sup>†</sup> `main`/development version of Immich.
>
> <sup>†</sup> Or at least, generally quite recent.

### Using with restic

> [!CAUTION]
> This is experimental.

> [!CAUTION]
> This is intentionally left uncomplete, as the token side of things is still being worked on.

```yaml
# compose.yml
name: futo-backups-proxy

services:
  restic-proxy:
    image: ghcr.io/immich-app/futo-backups-restic-proxy:v0
    ports:
      - 127.0.0.1:1434:1434
    restart: always
```

And then point restic at it:

```bash
# parameters subject to change
restic -r rest:http://<REPOSITORY>:<SESSION TOKEN>@127.0.0.1:1434 init
```
