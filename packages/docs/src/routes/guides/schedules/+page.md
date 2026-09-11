---
title: Schedules
description: Run backups automatically, and control how long old snapshots are kept
order: 3
---

A backup only protects you if it keeps running. Schedules do that.

## In Immich

Open the backups page, select **Configure**, then **Schedule**, and turn on **Run backups automatically**.

Pick a **Frequency** of daily, weekly or monthly and a **Start time** on the hour. The default is daily at 03:00. The page tells you in plain words when backups will run, then select **Save**.

## In the standalone app

Schedules are separate from backups, so one schedule can run several backups in order.

1. Go to **Schedules** and select **Create new schedule**.
2. Give it a **Name**.
3. Set **Schedule**, which takes a cron expression. The box starts at `*/15 * * * *`, every fifteen minutes, which is almost certainly not what you want.
4. Add the backups it should run, in the order you want them.
5. Save.

Common expressions:

| Expression | When it runs |
| --- | --- |
| `0 3 * * *` | Every day at 03:00 |
| `0 3 * * 0` | Every Sunday at 03:00 |
| `0 */6 * * *` | Every six hours |
| `30 2 1 * *` | The first of the month at 02:30 |

The five fields are minute, hour, day of month, month and day of week.

> [!NOTE]
> Schedules in the standalone container run in **UTC**. Setting a timezone on the container does not change this today, so convert your intended local time to UTC when writing the expression.

A schedule shows its expression, when it last ran, and whether it is paused. Its menu has **Pause**, **Resume**, **Configure** and **Delete**.

## What happens when a schedule fires

The backups in a schedule run one after another, in the order you arranged them.

- If the machine is off or the container is not running when a schedule is due, that run is simply missed. There is no catch-up run afterwards.
- If a backup from the previous run is somehow still going, that backup is recorded as failed for this run rather than starting twice.
- The "last ran" time is when the schedule started, not when it finished.

## How long snapshots are kept

After each run, snapshots older than the retention period are removed and the space is reclaimed. The default keeps **60 days**.

In Immich you can change this under **Configure**, then **Storage**, in **Delete old backups**: 15, 30, 60 or 90 days, only the latest two backups, or keep everything.

In the standalone app the 60 day default applies and there is no setting for it yet. If you need to keep snapshots for longer than that today, use a [write-once backup](/guides/backups#write-once-backups), which never deletes anything.

> [!NOTE]
> Retention counts from when each snapshot was taken, not from when the file was last changed. A file that never changes stays in your backups for as long as you keep taking snapshots of it.
