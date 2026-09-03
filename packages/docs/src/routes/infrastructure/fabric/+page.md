---
title: Switch fabric
description: The Falkenstein Junos spine and leaf fabric as code, with its ID-derived addressing plan, module layout, providers and import workflow
order: 6
---

The Falkenstein (site 40) switch fabric is managed as code in the [tf/deployment/prod/htz-fsn1/fabric](https://github.com/immich-app/yucca/tree/main/tf/deployment/prod/htz-fsn1/fabric) stack, driving Junos via the `jeremmfr/junos` provider and mirroring the IP plan into NetBox. It manages:

- **spine** (`corenetsw` VC) — shared site core: VC, per-port breakout (ports 1-3 100G→4×25G, port 0 100G→4×10G for the father CPs), VLAN stretch.
- **cls1** (`cls1netsw` VC) — ceph cluster 1's leaf pair: public/private VLANs, IRB gateways, the `NO-CROSS-VLAN` filter, and the 48 server LAGs.

Each ceph cluster = one leaf pair; the spine is shared across clusters.

## Addressing

Everything is derived from IDs; the [fabric-addressing module](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/fabric-addressing) is the single source of truth.

|                   | scheme                         | site 40 / cluster 1                              |
| ----------------- | ------------------------------ | ------------------------------------------------ |
| site supernet     | `10.<site>.0.0/16`             | `10.40.0.0/16`                                   |
| management (vme)  | `10.<site>.5.0/24`             | `10.40.5.0/24` (spine `.115`, leaf `.125`)       |
| kube (VLAN)       | `10.<site>.<kube_octet>.0/24`  | `10.40.10.0/24` → vlan 10                        |
| kube-cp (VLAN)    | `10.<site>.<kube_cp_octet>.0/24` | `10.40.11.0/24` → vlan 11 (gw `.1` = spine IRB) |
| cluster `n` /20   | `10.<site>.<n*16>.0/20`        | `10.40.16.0/20`                                  |
| public (VLAN)     | cluster /20, /23 idx 2         | `10.40.20.0/23` → vlan 20                        |
| private (VLAN)    | cluster /20, /23 idx 3         | `10.40.22.0/23` → vlan 22                        |
| leaf vme          | `.125 + (n-1)*10`              | `.125`                                           |

VLAN id == the network's third octet; gateway = `.1` (IRB on the leaf, except the site-global kube/kube-cp VLANs, whose IRBs live on the spine).

> **`kube-cp` is the control-plane VLAN.** The father bare-metal CPs are its only members (etcd CP↔CP + apiserver + the Talos-elected API **VIP** `10.40.11.5`), hanging off the spine's port-0 **4×10G** breakout (ae4-6, one leg per VC member). The spine routes kube↔kube-cp between its two IRBs (`10.40.10.1` / `10.40.11.1`), which is how worker kubelets and the apiserver reach each other; worker↔worker east-west rides the `kube` VLAN at 50G. Operators reach the API over the NetBird kube-cp route (the CPs are the route peers). Historically kube-cp was an isolated Hetzner Cloud subnet for the retired cloud CP VMs + API LB — same CIDR, so the API DNS record and etcd addressing carried over unchanged.

The cluster side of the kube and kube-cp VLANs is described in [Talos clusters](/infrastructure/talos).

## Layout

The modules live under [tf/shared/modules](https://github.com/immich-app/yucca/tree/main/tf/shared/modules).

- [modules/fabric-addressing](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/fabric-addressing) — IDs → CIDRs/VLANs/gateways (single source of truth).
- [modules/core-fabric](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/core-fabric) / [modules/cluster-fabric](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/cluster-fabric) — the spine / leaf config as typed `junos_*` resources (interfaces, vlans, bgp, firewall, policy, …), parameterized on the addressing. `system services` + `root-authentication` + `vme` are deliberately NOT managed, so no apply can break the management path.
- [modules/identity](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/identity) — the central user + group registry (single source of truth for who has access and what they're a member of). Edit it to add people. Members of fabric-mapped groups (e.g. `fabric-admins` → super-user) are synthesized into login users here and applied to every VC. The same registry will drive servers.
- [modules/fabric-login](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/fabric-login) — applies login users + SSH keys + rights to a VC (public keys committed; passwords via vars from 1Password). Fed by `modules/identity`.
- [modules/fabric-netbox](https://github.com/immich-app/yucca/tree/main/tf/shared/modules/fabric-netbox) — mirrors the IP plan into NetBox (prefixes + VLANs).

## The providers

- `junos` (`jeremmfr/junos`) — the switch fabric: a typed, per-resource provider from the registry (pinned in [versions.tf](https://github.com/immich-app/yucca/blob/main/tf/deployment/prod/htz-fsn1/fabric/versions.tf)). It drives each VC over NETCONF (port 830) as the `terraform` user; commits are `commit confirmed` (auto-rollback) and `infra:apply` confirms each switch after a successful apply.
- `hetzner` (`zack/hetzner`) — the Hetzner Robot API, for [management host](/infrastructure/management-hosts) reprovisioning ([mgmt.tf](https://github.com/immich-app/yucca/blob/main/tf/deployment/prod/htz-fsn1/fabric/mgmt.tf)); the one provider not on a registry, cloned + built (pinned tag) into a filesystem mirror by `mise run mgmt:provider-build`.
- `mise run infra:providers` — build the hetzner provider into the mirror and write `tf/.terraformrc.local` (consumed via `TF_CLI_CONFIG_FILE`).

## Running

```sh
mise run infra:plan      # builds providers, renders creds from 1Password, terragrunt plan
mise run infra:apply     # ... apply
```

(`SITE` selects the stack; defaults to `htz-fsn1`.) The shared Terraform tooling these tasks build on is described in [Terraform](/infrastructure/terraform).

CI: [.github/workflows/infra.yml](https://github.com/immich-app/yucca/blob/main/.github/workflows/infra.yml) — plan on PR, gated apply on merge behind the site-scoped `prod-htz-fsn1` GitHub Environment (required reviewers).

## Adopting existing config

`jeremmfr/junos` supports `terraform import`. To bring config that already exists on a switch under management (a new resource, or a new VC against pre-seeded config), add an `import {}` block — id = the config name, e.g. `et-0/0/0`, `lo0.0`, `PROTECT-RE_-_inet`, `<dest>_-_<ri>` (static route), `<ip>_-_<ri>_-_<group>` (bgp neighbor) — run `plan`, review (**expect 0 destroys**), `apply`, then remove the block. NetBox prefixes/VLANs likewise import before first apply or they clash. The whole fabric was adopted this way.
