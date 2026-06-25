# htz-fsn1 — production switch fabric (Junos via JTAF + NetBox)

Manages the Falkenstein (site 40) switch fabric as code:

- **spine** (`corenetsw` VC) — shared site core: VC, 100G→4×25G breakout, VLAN stretch.
- **cls1** (`cls1netsw` VC) — ceph cluster 1's leaf pair: public/private VLANs, IRB
  gateways, the `NO-CROSS-VLAN` filter, and the 48 server LAGs.

Each ceph cluster = one leaf pair; the spine is shared across clusters.

## Addressing (derived from IDs — see `modules/fabric-addressing`)

| | scheme | site 40 / cluster 1 |
|---|---|---|
| site supernet | `10.<site>.0.0/16` | `10.40.0.0/16` |
| management (vme) | `10.<site>.5.0/24` | `10.40.5.0/24` (spine `.115`, leaf `.125`) |
| cluster `n` /20 | `10.<site>.<n*16>.0/20` | `10.40.16.0/20` |
| public (VLAN) | cluster /20, /23 idx 2 | `10.40.20.0/23` → vlan 20 |
| private (VLAN) | cluster /20, /23 idx 3 | `10.40.22.0/23` → vlan 22 |
| leaf vme | `.125 + (n-1)*10` | `.125` |

VLAN id == the network's third octet; gateway = `.1` (IRB on the leaf).

## Layout

- `modules/fabric-addressing` — IDs → CIDRs/VLANs/gateways (single source of truth).
- `modules/core-fabric` / `modules/cluster-fabric` — the spine / leaf config (one
  JTAF `junos-qfx` resource each), generated from the live config and parameterized
  on the addressing. **Secrets (`root-authentication`) are stripped.**
- `modules/fabric-login` — login users + SSH keys + rights (public keys committed;
  passwords via vars from 1Password).
- `modules/fabric-netbox` — mirrors the IP plan into NetBox (prefixes + VLANs).

## The provider

The `junos-qfx` provider is **JTAF-generated and vendored** in `tf/providers/` (not on
any registry). It's built into a local filesystem mirror by `mise run fabric:provider-build`.

- `mise run fabric:provider-gen` — regenerate from device YANG + live config (only
  when adding new config hierarchies), then commit `tf/providers/`.
- `mise run fabric:provider-build` — `go build` the vendored source into the mirror
  and write `tf/.terraformrc.fabric` (consumed via `TF_CLI_CONFIG_FILE`).

## Running

```sh
mise run fabric:plan     # builds provider, renders the NETCONF key from 1Password, terragrunt plan
mise run fabric:apply    # ... apply
```

CI: `.github/workflows/fabric.yml` — plan on PR, gated apply on merge behind the
site-scoped `prod-fabric-htz-fsn1` GitHub Environment (required reviewers).

## Adoption caveat (first run)

The JTAF provider has **no `terraform import`** and pushes config with `action="merge"`
(additive). NetBox objects + the existing direct switch config already exist (manually
seeded), so the first `apply` *asserts* matching config (idempotent on the switches)
and **NetBox prefixes/VLANs must be `import`ed** first or they'll clash. Run a `plan`
and review before the first `apply`.
