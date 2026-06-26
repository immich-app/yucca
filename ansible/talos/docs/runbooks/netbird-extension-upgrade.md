# NetBird extension: schematic upgrade (staging)

Rolling a `siderolabs/netbird` system extension onto the `yucca-staging`
bare-metal Talos cluster so each node joins the NetBird overlay as a peer.

This is the manual half of the change: Terraform stages the new schematic image
and the `ExtensionServiceConfig` (with `NB_SETUP_KEY`) into every node's machine
config, but Talos only installs an extension on an **install or upgrade** — a
plain config apply does not pull the new image. So after `tf:apply`, an operator
runs a rolling `talosctl upgrade`.

## Pre-conditions

| Item | How to verify |
|------|---------------|
| `clusters.auto.tfvars` `talos_schematic_id` includes `siderolabs/netbird` | schematic id `f141fc2a08…` (regenerate at https://factory.talos.dev if changed) |
| `staging/netbird` stack applied (mints the talos setup key) | `op read "op://yucca_tf_staging/NETBIRD_YUCCA_STAGING_TALOS_SETUP_KEY/password"` |
| `staging/talos` stack applied (machine config carries the schematic + ExtensionServiceConfig) | `TF_STACK_DIR=tf/deployment/staging/talos mise run tf:apply` |
| talosconfig for the cluster | `op read "op://yucca_tf_staging/YUCCA_STAGING_TALOSCONFIG/password" > /tmp/staging.talosconfig` |
| Operator host routes 10.10.10.0/24 (apid 50000 reachable; in the firewall allow-list) | `talosctl -n 10.10.10.47 version` |

## Rolling upgrade (one node at a time — preserve etcd quorum)

Nodes: `staging-cp1 10.10.10.47`, `staging-cp2 10.10.10.242`, `staging-cp3 10.10.10.117`.
All three are control planes, so **never** upgrade two at once — wait for full
health between nodes.

```bash
export TALOSCONFIG=/tmp/staging.talosconfig
SCHEMATIC=f141fc2a08d5a459a80d871faa48d7dc92bc354e4faf6cdbafe1cc0fac717991
IMAGE=factory.talos.dev/metal-installer/${SCHEMATIC}:v1.13.4

for ip in 10.10.10.47 10.10.10.242 10.10.10.117; do
  echo "== upgrading $ip =="
  talosctl -n "$ip" -e "$ip" upgrade --image "$IMAGE" --wait
  talosctl -n "$ip" -e "$ip" health --wait-timeout 10m   # etcd quorum + node Ready
done
```

Notes:
- `--image` uses the **metal-installer** variant to match the module's
  `machine.install.image` for these metal nodes.
- `talosctl upgrade` reboots the node; the `--wait` plus the follow-up `health`
  gate keeps the loop from advancing until quorum is restored.
- The upgrade keeps the OS version (`v1.13.4`); it only changes the schematic
  (adds the extension). No Kubernetes version change.

## Verify

```bash
# Extension service is running (not crash-looping) on each node:
talosctl -n 10.10.10.47 services | grep -i netbird     # ext-netbird → Running

# Extension picked up the setup key (env injected — fixed since Talos 1.13):
talosctl -n 10.10.10.47 logs ext-netbird | tail
```

Then in the NetBird console (or `netbird status` from any peer) confirm 3 new
peers in group `YUCCA_STAGING_TALOS`.

## Rollback

Set `talos_schematic_id` back to the previous value
(`29ffdc12246124c1428026e3935f3c6170d6ee867293484312c97540ab1171b5`), `tf:apply`,
and roll `talosctl upgrade` to that installer image the same way. The
`ExtensionServiceConfig` is inert once the extension is gone.
