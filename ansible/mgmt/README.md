# mgmt — Hetzner FSN1 Management Hosts

Ansible automation that configures the two Hetzner management hosts after they
are reprovisioned to Debian 13 ("trixie"). Mirrors the conventions of the
sibling `ansible/ceph/` tree (layout, `ansible.cfg`, role structure,
systemd-networkd templating).

| Host | Public IP | Role |
|------|-----------|------|
| `htz-fsn-mgmt-1` | `178.63.124.40` | Tailscale subnet router (advertises `10.40.5.0/24`) |
| `htz-fsn-mgmt-2` | `178.63.124.41` | — |

Both are AX41-NVMe. The inventory is committed (these are two static hosts,
not TF-rendered like ceph's clusters) at
`inventories/htz-fsn1/hosts.yml`.

## What it does

`site.yml` applies these roles in order:

1. **baseline** — apt cache + base packages, timezone UTC, hostname from
   inventory, `/etc/hosts`.
2. **users** — login users for the members of the identity registry's
   `server`-mapped groups (`nutgood`, `andy` — both in `server_admins`,
   `sudo = ALL`). The list lives in
   `inventories/htz-fsn1/group_vars/all.yml` (`mgmt_users`) and **mirrors
   `tf/shared/modules/identity`** — keep it in sync by hand for now.
3. **security** — nftables firewall, SSH hardening (no password auth,
   `PermitRootLogin prohibit-password`), unattended-upgrades.
4. **networkd** — systemd-networkd VLAN sub-interfaces on the 25G fabric NIC.
   **Gated on `mgmt_networkd_enabled` (default false)** — see the 25G caveat
   below.
5. **tailscale** — install Tailscale, `tailscale up`; mgmt-1 additionally
   advertises `10.40.5.0/24`.

## Reprovision → Ansible flow

1. Reprovision both hosts to Debian 13 via Hetzner robot auto-install.
2. Post-reprovision, root is reachable over SSH with the TF-generated
   provisioning key (stored in 1Password). Render it and run `site.yml`.

```bash
# Render the provisioning private key from 1Password to a temp file
umask 077
op read --account team-futo \
  "op://yucca_tf_prod/HTZ_FSN1_PROVISIONING_SSH_PRIVATE_KEY/password" \
  > /tmp/htz-fsn1-prov-key
chmod 600 /tmp/htz-fsn1-prov-key

# Run the playbook (root, provisioning key, tailscale auth key from 1P)
ansible-playbook -i inventories/htz-fsn1 site.yml \
  --private-key /tmp/htz-fsn1-prov-key \
  --extra-vars "mgmt_tailscale_authkey=$(op read --account team-futo \
    'op://yucca_tf/TAILSCALE_OAUTH_CLIENT_SECRET/password')"

# Clean up
shred -u /tmp/htz-fsn1-prov-key
```

`ansible.cfg` sets `inventory = inventories/htz-fsn1/hosts.yml`, so `-i` is
optional. The inventory connects as `ansible_user: root`.

The whole render-key + run flow above is wrapped by `mise run mgmt:ansible`
(`SITE` selects the inventory; defaults to `htz-fsn1`), which CI also runs on
every **prod** apply — the `Ansible converge (mgmt hosts)` step of
`.github/workflows/infra.yml`, right after the Terraform apply. It's idempotent
and reaches the hosts over their public IP, so it requires them to already be
reprovisioned (provisioning key authorized).

> The `--private-key` flow is preferred over `ansible_ssh_private_key_file` in
> group_vars so the key never has to be persisted to a committed path — it is
> rendered to a temp file, used, and shredded.

## 25G fabric caveat

The 25G fabric link (Intel E810, "ice" driver) is **currently physically
unreliable**. The `networkd` role that configures its VLAN sub-interfaces is
gated off by default (`mgmt_networkd_enabled: false`), so a normal `site.yml`
run is a no-op for networking. Once the fabric links:

1. Confirm the NIC name on each host with `ip link` (prior name:
   `enp33s0f0np0`) and correct `mgmt_fabric_nic` in the host_vars if it
   differs.
2. Set `mgmt_networkd_enabled: true` (e.g. `--extra-vars` or group_vars).

VLAN layout (gateways are `.1` on the leaf IRB):

| VLAN | Network | mgmt-1 | mgmt-2 |
|------|---------|--------|--------|
| 20 (cluster public) | `10.40.20.0/23` | `10.40.20.2` | `10.40.20.3` |
| 22 (cluster private) | `10.40.22.0/23` | `10.40.22.2` | `10.40.22.3` |

The primary public NIC keeps Hetzner's DHCP default — this tree does not touch
it.

## Setup

```bash
ansible-galaxy collection install -r requirements.yml
ansible-playbook -i inventories/htz-fsn1 --syntax-check site.yml
```

## Secrets

Nothing secret is committed. SSH public keys are public data and live in
`group_vars/all.yml`. Runtime secrets are passed via `op read`:

- Provisioning private key: `op://yucca_tf_prod/HTZ_FSN1_PROVISIONING_SSH_PRIVATE_KEY/password`
- Tailscale auth: `op://yucca_tf/TAILSCALE_OAUTH_CLIENT_SECRET/password` (OAuth
  client secret, same as CI; requires `--advertise-tags`, set by the role)
