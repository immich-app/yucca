# htz-fsn1 — production switch fabric (Junos via jeremmfr/junos + NetBox)

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
| kube (VLAN) | `10.<site>.<kube_octet>.0/24` | `10.40.10.0/24` → vlan 10 |
| kube-cp (hcloud) | `10.<site>.<kube_cp_octet>.0/24` | `10.40.11.0/24` (gw `.1`, CP VMs etcd + API LB) |
| cluster `n` /20 | `10.<site>.<n*16>.0/20` | `10.40.16.0/20` |
| public (VLAN) | cluster /20, /23 idx 2 | `10.40.20.0/23` → vlan 20 |
| private (VLAN) | cluster /20, /23 idx 3 | `10.40.22.0/23` → vlan 22 |
| leaf vme | `.125 + (n-1)*10` | `.125` |

VLAN id == the network's third octet; gateway = `.1` (IRB on the leaf).

> **`kube-cp` is not a fabric VLAN.** It's a small isolated **Hetzner Cloud private
> subnet** holding only the cloud control-plane VMs (etcd CP↔CP) + the API LB's
> private IP. CP↔worker control traffic and worker→API ride the **NetBird WireGuard
> mesh** (node IPs are NetBird addresses), and worker↔worker east-west rides the
> `kube` fabric net (`10.40.10.0/24`) at 50G via Cilium BGP. The API endpoint is a
> **Hetzner Cloud LB** (no L2 VIP — hcloud private nets are anti-spoofed/routed).
> `kube-cp` is carved from the site supernet only for collision-free IPAM and is
> **never** configured on the Junos switches.

## Layout

- `modules/fabric-addressing` — IDs → CIDRs/VLANs/gateways (single source of truth).
- `modules/core-fabric` / `modules/cluster-fabric` — the spine / leaf config as typed
  `junos_*` resources (interfaces, vlans, bgp, firewall, policy, …), parameterized on
  the addressing. `system services` + `root-authentication` + `vme` are deliberately
  NOT managed, so no apply can break the management path.
- `modules/identity` — the central user + group registry (single source of truth
  for who has access and what they're a member of). Edit it to add people. Members
  of fabric-mapped groups (e.g. `fabric-admins` → super-user) are synthesized into
  login users here and applied to every VC. The same registry will drive servers.
- `modules/fabric-login` — applies login users + SSH keys + rights to a VC (public
  keys committed; passwords via vars from 1Password). Fed by `modules/identity`.
- `modules/fabric-netbox` — mirrors the IP plan into NetBox (prefixes + VLANs).

## The providers

- `junos` (`jeremmfr/junos`) — the switch fabric: a typed, per-resource provider from
  the registry (pinned in `versions.tf`). It drives each VC over NETCONF (port 830) as
  the `terraform` user; commits are `commit confirmed` (auto-rollback) and
  `infra:apply` confirms each switch after a successful apply.
- `hetzner` (`zack/hetzner`) — the Hetzner Robot API, for mgmt-host reprovisioning
  (`mgmt.tf`); the one provider not on a registry, cloned + built (pinned tag) into a
  filesystem mirror by `mise run mgmt:provider-build`.

- `mise run infra:providers` — build the hetzner provider into the mirror and write
  `tf/.terraformrc.local` (consumed via `TF_CLI_CONFIG_FILE`).

## Running

```sh
mise run infra:plan      # builds providers, renders creds from 1Password, terragrunt plan
mise run infra:apply     # ... apply
```

(`SITE` selects the stack; defaults to `htz-fsn1`.)

CI: `.github/workflows/infra.yml` — plan on PR, gated apply on merge behind the
site-scoped `prod-htz-fsn1` GitHub Environment (required reviewers).

## Adopting existing config

`jeremmfr/junos` supports `terraform import`. To bring config that already exists on a
switch under management (a new resource, or a new VC against pre-seeded config), add an
`import {}` block — id = the config name, e.g. `et-0/0/0`, `lo0.0`, `PROTECT-RE_-_inet`,
`<dest>_-_<ri>` (static route), `<ip>_-_<ri>_-_<group>` (bgp neighbor) — run `plan`,
review (**expect 0 destroys**), `apply`, then remove the block. NetBox prefixes/VLANs
likewise import before first apply or they clash. The whole fabric was adopted this way.
