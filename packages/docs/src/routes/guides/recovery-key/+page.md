---
title: Your recovery key
description: What the recovery key protects, where to keep it, and how to use it when you rebuild a machine
order: 1
---

Your backups are encrypted on your own machine before anything is uploaded. The recovery key is what that encryption is based on. FUTO stores your backup data but not your key, so nobody at FUTO can read your backups, and nobody at FUTO can get them back for you if you lose the key.

> [!CAUTION]
> If you lose the recovery key and lose the machine, your backups cannot be recovered. Not by you, not by FUTO, not by anyone. Save it somewhere separate from the machine you are backing up.

## What it looks like

A recovery key is 64 hexadecimal characters. The app shows it in blocks of four to make it easier to read or write down, like this:

```
1F4A 9C02 7B31 D8E6
5A0F 3C7D 9E14 82BB
6D50 A3F9 04C7 1E88
B27A 5F63 CD09 4E12
```

Every backup on the machine gets its own encryption key, worked out from this one key. That is why a single recovery key is enough to unlock all of them, and why losing it loses all of them at once. It also means the recovery key is not itself a password you can hand to the `restic` command line; only the app can turn it back into the per-backup keys.

## Saving it

When the app shows you the key during setup, it gives you three ways to keep it, and will not let you continue until you tick **I saved my recovery key somewhere safe**:

- **Copy recovery key**, to paste into a password manager. This is the option most people should use.
- **Download**, which saves it as `backups-recovery-code.txt`.
- **Print**, for a paper copy.

Good places to keep it: a password manager, a printed copy somewhere safe, or a file on a different machine. A bad place: only on the machine you are backing up, because that is exactly the machine you are protecting against losing.

> [!NOTE]
> Your backups do contain a copy of the key, but you need the key to read them, so they are not a substitute for saving it yourself.

## Seeing it again later

In **Immich**, open the backups page and select **View recovery key**.

In the **standalone app** there is no button for this yet. If you are signed in to the app, you can still read it from the API in your browser:

```
http://localhost:22676/api/yucca/onboarding/recovery-key
```

If neither is available to you any more, and you did not save the key, treat the existing backups as lost and start fresh with a new one.

## Using it on a new machine

The key is how a rebuilt machine gets back to your existing backups. When you set up the app again, choose **Import key** on the first screen instead of generating a new one, paste your key into the **Recovery Key** field, and save. Spacing and capitalisation do not matter.

With the right key imported, your existing backups become readable and you can restore from them. See [restoring files](/guides/restore) for the full walkthrough.

If you import the wrong key, nothing is deleted, but the app cannot read those backups. You will see "Can't access, is your recovery key correct?" next to them, or "Can't read repository" when importing. Import the correct key and they become readable again.

> [!WARNING]
> Importing a key replaces the one the machine is already using, with no confirmation and no undo. On a machine that has been backing up for a while, that makes its own existing backups unreadable until you import the original key back. Only import on a fresh setup, or when you are deliberately reconnecting to older backups.

## If you generate a new key instead

Setting up with a fresh key does not delete anything, but the new key cannot read backups made with the old one. You end up with two sets: the old backups, still encrypted with a key you no longer have, and the new ones. If you are rebuilding a machine and want your history, import the old key.
