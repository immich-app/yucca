# Runbook: Reprovision Painbox

**Status:** Validated 2026-04-26. Executed end-to-end during the yucca
monorepo import PR — painbox now runs as `painbox-ceph-evelyn` on
Bookworm with Ceph Tentacle deployed (15 OSDs up + in, all LUKS-encrypted).
This runbook captures the procedure for future reprovisions (disaster
recovery, OS upgrade, hardware refresh) and remains the canonical
Hetzner-installimage flow for any future SX-class clusters.

**When:** any future painbox reprovision — DR scenario, kernel/OS upgrade
that requires a fresh install, or hardware change that invalidates the
existing layout.

**Time estimate:** 45-60 minutes including installimage wait + reboot
+ post-deploy verification.

---

## Pre-flight

Canonical painbox identity (a future reprovision keeps this — a DR scenario
restores the same name on the same hardware):

| Item           | Value                                                          |
|----------------|----------------------------------------------------------------|
| Inventory dir  | `inventories/painbox-ceph.dev.hel.htz/`                        |
| Short hostname | `painbox-ceph-evelyn`                                          |
| FQDN           | `painbox-ceph-evelyn.dev.hel.htz.futo.cloud`                   |
| Public IP      | `157.180.105.198`                                              |
| OS image       | Debian 12 Bookworm (Hetzner installimage tarball)              |
| SSH key path   | `~/.ssh/id_ed25519_painbox` (per [ADR-010](../adr/010-ssh-keys-in-1password.md)) |

1P items (`PAINBOX_CEPH_*`) already exist in `yucca_tf_dev`, including
the `PAINBOX_CEPH_ANSIBLE_IAC_SSH_KEY` SSH Key item.

> **Historical note:** the first reprovision under this identity ran
> 2026-04-26 as a rename from `painbox-osd-5c3cac.lab.hel.htz.futo.cloud`
> + old SSH key `~/.ssh/id_ed25519_ceph-painbox-lab-hel-htz` to the
> values above. Subsequent reprovisions (DR, OS refresh, etc.) restore
> the same identity — no rename involved.

## Steps

### 1. Install the ansible-iac SSH key on the operator workstation

Per [ADR-010](../adr/010-ssh-keys-in-1password.md), the keypair lives in
1P and is pulled to the workstation idempotently:

```bash
scripts/install-ssh-keys.sh painbox
# Writes ~/.ssh/id_ed25519_painbox (0600) + .pub (0644)
```

If the key was already installed from a previous session, this is a
no-op (fingerprint compare + skip). See [docs/scripts.md](../scripts.md)
for the wrapper's behavior.

### 2. Boot into Hetzner rescue

From Hetzner Robot panel: **Activate rescue system** → **Reboot**. SSH in
as root to the rescue IP.

> **Hetzner rotates the rescue root password on every activation.** The
> password shown in the Robot panel after activation is single-use for
> that rescue session — the next activation gets a fresh one. The 1Password
> entry `painbox-ceph-evelyn.dev.hel.htz.futo.cloud` (vault: `Yucca`) holds
> a *cached* copy from a prior activation; **update it from the Robot
> panel each time** before SSH'ing in, or the cached password fails auth.
> Rescue host keys also rotate per activation, so use `-o
> StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` (or
> `ssh-keygen -R <ip>` first) when connecting.

### 3. Render + upload installimage scripts

`post-install.sh` is TEMPLATED — source of truth is `post-install.sh.tpl`,
which embeds an `op://` reference to the current
`PAINBOX_CEPH_ANSIBLE_IAC_SSH_KEY` pubkey. Render locally so rotations
propagate at reprovision time without edits:

```bash
cd ansible/ceph/inventories/painbox-ceph.dev.hel.htz/installimage
op inject -f -i post-install.sh.tpl -o /tmp/post-install.sh.rendered
```

Upload both files to the rescue system:

```bash
scp /tmp/post-install.sh.rendered root@<rescue-ip>:/tmp/post-install.sh
scp autosetup root@<rescue-ip>:/autosetup
```

### 4. Run installimage

```bash
# On the rescue system
chmod +x /tmp/post-install.sh
installimage -a -c /autosetup -x /tmp/post-install.sh
```

(`autosetup` targets `painbox-ceph-evelyn.dev.hel.htz.futo.cloud` as
HOSTNAME statically. If you ever rotate the hostname, edit autosetup
directly.)

### 5. Reboot into installed OS

```bash
reboot
```

SSH in with the new keypair:

```bash
ssh -i ~/.ssh/id_ed25519_painbox root@157.180.105.198 hostname -f
# Expect: painbox-ceph-evelyn.dev.hel.htz.futo.cloud
```

### 6. Update `yucca_tf_dev` state (if items were renamed)

The `PAINBOX_CEPH_*` items in `yucca_tf_dev` are already correctly named —
no action needed. Disaster-recovery items (`PAINBOX_CEPH_RGW_TLS_CERT`,
`_RGW_TLS_KEY`, `_CLIENT_ADMIN_KEYRING`) are upserted by `mise run capture` after
a successful deploy (step 8).

### 7. Run ansible deploy

```bash
cd ~/yucca/ansible/ceph
export CEPH_ENV=inventories/painbox-ceph.dev.hel.htz/inventory.ini
mise run preflight     # should pass
mise run deploy        # baseline → tune → deploy → tune → harden
```

### 8. Verify

```bash
ssh ansible-iac@painbox-ceph-evelyn.dev.hel.htz.futo.cloud sudo ceph -s
# HEALTH_OK (single-node cluster)
```

## Rollback

If reprovisioning fails at installimage or post-install, Hetzner rescue
is still accessible:

1. Activate rescue, SSH in.
2. Re-run installimage with the OLD scripts (preserve them in
   `docs/archive/painbox-installimage-2026-04-xx/` before overwriting).
3. Old hostname + old SSH key restore the prior-state box.
4. No cluster data is on this box (painbox never held Ceph data),
   so nothing to restore.

## Post-reprovision cleanup

- Delete the old SSH key file `~/.ssh/id_ed25519_ceph-painbox-lab-hel-htz*`
  from the operator workstation once verification is complete.
- If any external DNS records pointed at `painbox-osd-5c3cac.lab.*`,
  update them to `painbox-ceph-evelyn.dev.*`.

(No edit to `post-install.sh` is required — the committed source of
truth is `post-install.sh.tpl`, which embeds a live `op://` reference
to the current `PAINBOX_CEPH_ANSIBLE_IAC_SSH_KEY/public_key`.
Re-rendering via `op inject -f` always picks up whatever is current in
1P at the moment of reprovision.)

## References

- `docs/runbooks/add-node.md` §Hetzner — the general installimage flow
- `docs/adr/010-ssh-keys-in-1password.md` — SSH keypair lifecycle
- `docs/scripts.md` — `install-ssh-keys.sh` reference
- `inventories/painbox-ceph.dev.hel.htz/installimage/` — scripts
