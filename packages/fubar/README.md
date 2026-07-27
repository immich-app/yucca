# fubar

**fubar** is FUTO Backups on the command line. It backs up the folders you care
about to your FUTO Backups account — encrypted, automatic, and out of your way.

Under the hood it drives [restic](https://restic.net/) (a fast, encrypted,
deduplicating backup tool), so your data is encrypted on your machine before it
ever leaves it. fubar adds the friendly parts: one-command login, scheduling, and
a clear view of what's backed up.

---

## Install

Download the binary for your system from the
[latest release](https://github.com/immich-app/yucca/releases/latest) and put it
on your `PATH`:

```bash
# macOS (Apple Silicon)
curl -L -o fubar https://github.com/immich-app/yucca/releases/latest/download/fubar_<version>_darwin_arm64
chmod +x fubar && sudo mv fubar /usr/local/bin/

# Linux (x86-64)
curl -L -o fubar https://github.com/immich-app/yucca/releases/latest/download/fubar_<version>_linux_amd64
chmod +x fubar && sudo mv fubar /usr/local/bin/
```

Check it works:

```bash
fubar --version
```

## Get started in three commands

**1. Log in.** This opens your browser to sign in to FUTO Backups. Your computer
is registered by its name, so you can tell your devices apart later.

```bash
fubar login --api https://api.backups.futo.org
```

**2. Create a backup.** Point fubar at the folders you want to protect and (optionally)
a schedule. This sets up an encrypted repository and saves the plan.

```bash
fubar init documents --path ~/Documents --path ~/Photos --cron "0 2 * * *"
```

fubar prints a **recovery password** during setup. **Write it down and keep it
somewhere safe** — it's the key to your encrypted backup. FUTO cannot recover
your data without it.

**3. Back up now.**

```bash
fubar backup documents
```

That's it. To have it run automatically on the schedule you set, install the
background service:

```bash
fubar service install
```

## Everyday commands

| Command | What it does |
|---|---|
| `fubar status` | See every backup: when it last ran, when it runs next, and how big it is. |
| `fubar backup [name]` | Back up now — one plan, or all of them if you don't name one. |
| `fubar snapshots <name>` | List the restore points in a backup. |
| `fubar restore <name> <snapshot> --target ~/restored` | Restore a snapshot into a folder. |
| `fubar doctor` | Check that everything's healthy (login, connection, backups). |
| `fubar service install` / `uninstall` / `status` | Manage the background scheduler. |

Run `fubar <command> --help` for the full options on any command.

## Scheduling

The `--cron` option on `fubar init` uses standard cron syntax:

| Schedule | `--cron` |
|---|---|
| Every day at 2 AM | `"0 2 * * *"` |
| Every hour | `"0 * * * *"` |
| Weekdays at 6 PM | `"0 18 * * 1-5"` |

fubar keeps a limited history by default (7 daily, 4 weekly, 6 monthly restore
points) and cleans up older ones automatically. Adjust with `--keep-daily`,
`--keep-weekly`, and `--keep-monthly` on `fubar init`.

If your machine is asleep when a backup was scheduled, fubar simply runs it at
the next scheduled time — it doesn't try to catch up.

## Restoring your data

```bash
fubar snapshots documents                     # find the restore point you want
fubar restore documents <snapshot-id> --target ~/restored
```

Restores go into the `--target` folder you choose, so they never overwrite your
current files.

## Where fubar keeps its settings

Everything lives under `~/.config/fubar/`:

- `config.toml` — your backup plans (you can edit this by hand).
- `token.json` — your login session.
- your repository passwords go into your **system keychain** (macOS Keychain or
  the Linux Secret Service). On a headless server with no keychain, fubar falls
  back to a locked-down file — you can force that with `FUBAR_NO_KEYCHAIN=1`.

## Troubleshooting

- **"the fubar feature (consumer-fubar) is not enabled for this account"** — fubar is a
  newer way to back up, and access is being rolled out gradually. Ask your FUTO
  Backups administrator to enable it for your account.
- **Something's not working** — run `fubar doctor`. It checks your login,
  connection, restic, and each backup, and points at whatever's wrong.
- **Automation didn't run** — `fubar service status` shows whether the
  background scheduler is installed and running.

## Privacy

Your files are encrypted on your machine before upload, with a password only you
hold. FUTO stores the encrypted data and never sees your files or your password.
fubar reports basic backup activity (start/finish, sizes, success/failure) so
your account dashboard can show backup health — never file names or contents.

---

*Developing fubar? See the developer notes below.*

## For developers

```bash
mise fubar:build          # → dist/fubar
mise fubar:dev -- <args>  # go run . <args>
mise fubar:test           # unit tests (joins `mise check` via *:test)
```

Integration test (real backup through the dev stack, gated by `FUBAR_IT`):

```bash
mise dev                        # bring up compose infra + services
FUBAR_IT=1 mise fubar:test:integration
```

It runs the whole path a user takes — device-flow login registering a `fubar`
consumer, repository creation, a real restic backup through michael, snapshot
verification, telemetry, and revocation — enabling the `consumer-fubar` flag for
its throwaway test user directly in Postgres.

restic is pinned (version + per-platform SHA256) in `internal/restic/fetch.go`,
downloaded once and cached, unless `FUBAR_RESTIC` or a `restic` on `PATH` is
found. This mirrors `yuctl`'s bench restic pinning — the two are separate Go
modules, so keep the version/checksums in sync when bumping either.
