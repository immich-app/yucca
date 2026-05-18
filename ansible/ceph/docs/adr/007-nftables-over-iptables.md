# ADR-007: nftables over iptables

## Status

Accepted

## Context

Ceph nodes expose many services: MON (3300, 6789), OSD (6800-7568), MGR/dashboard
(8443), RGW/S3 (443), Prometheus (9095), Grafana (3000), Alertmanager (9093),
node-exporter (9100), plus optional iSCSI and NFS ports. Without a firewall,
all of these are reachable from any source on the network.

The two main Linux firewall frameworks are:

- **iptables/ip6tables** -- legacy, being replaced upstream. Uses separate
  tables for IPv4/IPv6. Debian 12 still ships it but marks it deprecated.
- **nftables** -- the successor. Single framework for IPv4/IPv6/ARP. Native
  in the kernel since 3.13. Debian 12's default backend for `iptables` is
  already `nft`.

## Decision

We use **nftables** with a Jinja2-templated ruleset (`nftables.conf.j2`)
managed by the security role. The template generates a complete `inet filter`
table with:

- Default-drop input policy.
- Established/related connection tracking.
- SSH open to all (or restricted to trusted networks, controlled by a variable).
- RGW/S3 port open to all (public-facing service).
- All other Ceph services restricted to `ceph_firewall_trusted_networks`.
- Rate-limited logging of dropped packets for diagnostics.
- Optional iSCSI and NFS blocks gated by boolean variables.

The ruleset is rendered from inventory variables (port numbers, trusted
networks, feature flags), making it consistent across nodes and clusters
without manual rule management.

## Consequences

- **Positive:** Single `inet` table covers both IPv4 and IPv6. No dual-stack
  rule duplication.
- **Positive:** Template-driven rules are version-controlled, auditable, and
  consistent across all nodes. Adding a new service means adding one variable
  and one template block.
- **Positive:** `flush ruleset` at the top ensures convergence -- re-applying
  the template replaces the entire ruleset atomically.
- **Negative:** Operators familiar only with `iptables` syntax need to learn
  nftables. Mitigated by the template being well-commented and the Debian 12
  ecosystem defaulting to nft.
