# Security Model

Audience: InfoSec, compliance review, security audits.

For how these controls fit the broader tool mesh, see
[architecture.md](architecture.md). For the per-item secrets catalog see
[secrets.md](secrets.md).

## Encryption at rest

All OSD volumes (HDD and SSD) are created with `--dmcrypt`, which wraps each
OSD's BlueStore volume in a dm-crypt/LUKS layer.

| Property | Detail |
|---|---|
| Encryption layer | dm-crypt (LUKS) via cephadm OSD service spec (`encrypted: true`) |
| Scope | Every OSD data volume and every OSD block.db volume |
| Key storage | MON config-key database (`config-key dump` shows dm-crypt entries) |
| Key distribution | MONs hand keys to OSD daemons at startup via the Ceph auth subsystem |
| Algorithm | AES-256-XTS (dm-crypt default) |

The encryption keys never leave the MON quorum. If a drive is removed from
the chassis, the data is unreadable without access to the MON key store.

### Verification

```bash
# Count dm-crypt keys in MON store
ceph config-key dump 2>/dev/null | grep -c dm-crypt

# Confirm OSDs are on dm-crypt devices
lsblk --output NAME,TYPE,MOUNTPOINT | grep crypt
```

## Encryption in transit

### RGW / S3 (client-facing)

| Property | Detail |
|---|---|
| Protocol | HTTPS (TLS 1.2+) on port 443 |
| Certificate | Self-signed RSA 4096-bit, 10-year validity |
| CN | `s3.staging.austin.int.futo.cloud` |
| SANs | `s3.staging.austin.int.futo.cloud`, `*.s3.staging.austin.int.futo.cloud`, per-node FQDNs, per-node bond IPs |
| Issuer | Self-signed (O=FUTO, L=Austin, ST=Texas, C=US) |
| Cert location | `/etc/ceph/rgw-ssl.crt` + `/etc/ceph/rgw-ssl.key` on bootstrap node |
| Distribution | cephadm distributes combined PEM to all RGW daemon containers |

Clients must either trust the self-signed cert via `--ca-bundle` / `verify=`
or disable TLS verification (`--no-verify-ssl`).

### Intra-cluster (MON/OSD/MGR)

Ceph messenger v2 (`msgr2`) is used for all intra-cluster communication.
The `cephx` authentication protocol provides mutual authentication between
daemons. Wire encryption (`ms_client_mode`, `ms_cluster_mode`) is available
but not explicitly forced in this deployment -- the default Tentacle
configuration uses `crc` mode (authenticated but not encrypted on the wire).

### Dashboard

Ceph dashboard runs on port 8443 (HTTPS) with its own self-signed cert,
restricted to trusted networks only via firewall rules.

## User model

Three user accounts exist on every node:

| User | UID | Authentication | Sudo | Purpose |
|---|---|---|---|---|
| `ansible-iac` | 1000 | SSH key only (password locked) | `NOPASSWD:ALL` | Ansible automation. No interactive use. |
| `ops` | 1001 | Password (from 1Password via `op inject`) | `ALL` (password required) | Human interactive access. Operator SSH keys distributed out-of-band post-deploy. |
| `root` | 0 | SSH key (cephadm inter-node) | n/a | Required by cephadm orchestrator for SSH between nodes. `PermitRootLogin prohibit-password`. |
| `ceph` | system | nologin shell | none | Ceph daemon processes. No login capability. |

### SSH hardening

| Setting | Value |
|---|---|
| `PermitRootLogin` | `prohibit-password` (key-only, required by cephadm) |
| `MaxAuthTries` | 3 |
| `AllowUsers` | `ansible-iac ops root` |
| `PasswordAuthentication` | Not explicitly disabled (ops user uses password + key) |

### Key management

- **ansible-iac key**: The keypair is stored in 1Password as an SSH Key item
  (`<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY` in `yucca_tf_dev`). Operator
  workstations install it via `scripts/install-ssh-keys.sh` →
  `~/.ssh/id_ed25519_<cluster>`. Rotation is forward-only (additive) via
  `rotate-ssh-key.yml` — new pubkey distributed to `authorized_keys` with
  `exclusive: false`, old keys pruned out-of-band. Keys are generated
  natively in 1Password, so the private half never touches operator disk at
  creation and a lost laptop is a non-event.
- **ops user keys**: Distributed out-of-band after initial deployment.
  No keys are provisioned at deploy time.
- **cephadm key**: Generated during `cephadm bootstrap`, distributed to all
  nodes during the join phase. Used for orchestrator SSH between nodes.

## Firewall rules (nftables)

Every node runs nftables with a default-drop input policy. The ruleset is
templated from `roles/security/templates/nftables.conf.j2`.

### Open to all sources

| Port | Service |
|---|---|
| 22/tcp | SSH (configurable: `ceph_firewall_ssh_any_source` defaults to true for dev) |
| 443/tcp | RGW / S3 endpoint |
| ICMP | Ping and MTU discovery |

### Restricted to trusted networks only

Trusted networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
`100.64.0.0/10` (Tailscale CGNAT).

| Port(s) | Service |
|---|---|
| 3300, 6789/tcp | Ceph MON |
| 6800-7300/tcp | Ceph OSD |
| 8443/tcp | Ceph Dashboard |
| 9095/tcp | Prometheus |
| 3000/tcp | Grafana |
| 9093/tcp | Alertmanager |
| 9100/tcp | Node Exporter |
| 9283/tcp | MGR Exporter |
| 9926/tcp | Ceph Exporter |

### Default policy

```
chain input  { policy drop; }   # all unmatched traffic is dropped
chain forward { policy drop; }  # no forwarding
chain output { policy accept; } # outbound unrestricted
```

Dropped packets are logged at rate 5/minute with prefix `nftables-drop: ` for
forensic review.

### Optional gateways (disabled by default)

- iSCSI (port 3260 + API 5000) -- `ceph_firewall_iscsi_enabled: false`
- NFS-Ganesha (port 2049 + mgmt 12049) -- `ceph_firewall_nfs_enabled: false`

## Secrets management

### 1Password + op inject

All deployment secrets live in 1Password in the `yucca_tf_dev` vault (dev
environment; staging/prod land as sibling `yucca_tf_staging` /
`yucca_tf_prod` vaults). Items are named `<CLUSTER>_CEPH_<ROLE>_*` — see
[docs/secrets.md](secrets.md) for the full catalog.

At playbook time, `scripts/ansible-play.sh` invokes `op inject` on the
TF-rendered `secrets.yml.tpl`, writes the resolved values to a `0600`
tmpfile, and passes it as `--extra-vars @tmpfile`. Tmpfile is `trap`-cleaned
on `EXIT`/`INT`/`TERM`. No at-rest encrypted file in git.

| Secret                           | Variable                          |
|----------------------------------|-----------------------------------|
| ops user password                | `vault_ops_password`              |
| Ceph dashboard admin password    | `vault_ceph_dashboard_password`   |
| Grafana admin password           | `vault_grafana_admin_password`    |
| S3 service-user access key       | `vault_s3_restic_access_key`      |
| S3 service-user secret key       | `vault_s3_restic_secret_key`      |

### Trust boundaries

Two service accounts separate write authority from runtime consumption:

| Service account                               | Scope                                      | Used by                                |
|-----------------------------------------------|--------------------------------------------|----------------------------------------|
| `yucca_futo_1pass_superuser_service_account`  | Read + write all `yucca_tf_*` vaults       | TF (`tf/.env`) + interactive `op` CLI  |
| `yucca_futo_1pass_service_account`            | Read-only on `yucca_tf` and `yucca_tf_dev` | Ansible runtime / future CI            |

The ansible-play.sh wrapper runs with whichever session is active on the
operator workstation (typically desktop unlock → superuser SA via 1Password
desktop). CI will use the read-only SA via `OP_SERVICE_ACCOUNT_TOKEN`.

Rotation procedure: [runbooks/rotate-sa-token.md](runbooks/rotate-sa-token.md).

### What is NOT in 1Password

- dm-crypt OSD encryption keys — stored in the MON config-key database.
  Deferred to 1P as a future belt-and-suspenders item (see yucca memory
  `project_luks_keys_in_1pass.md`).
- cephadm bootstrap SSH key — generated at bootstrap, distributed by
  cephadm's orchestrator. Not needed outside the cluster.
- ops user SSH keys — distributed out-of-band after initial deployment.
  See "ops user keys" in Key management above.

## Audit logging

| Control | Detail |
|---|---|
| Ceph audit log | Enabled (`ceph config set global log_to_cluster_level audit`) |
| Ceph manager log | `mgr/cephadm/log_to_cluster true` |
| View audit log | `ceph log last -W audit` |
| Firewall logging | Dropped packets logged at 5/min with `nftables-drop:` prefix |
| Prometheus alerts | 16+ alert rule groups (89 built-in rules) covering OSD, MON, PG, pool, MDS, hardware, network |

The audit channel records all `ceph` admin commands executed against the
cluster, including the authenticated user, timestamp, and command arguments.

## Telemetry

Telemetry phone-home is explicitly disabled:

```
ceph_telemetry_enabled: false
```

No cluster metadata, performance data, or crash reports are sent to upstream
Ceph. All data stays within the cluster boundary.

## Network topology

| Network | CIDR | Purpose |
|---|---|---|
| Public/Cluster | 10.10.10.0/24 | Combined public + cluster traffic (single-network topology) |
| iDRAC/BMC | 10.10.11.0/24 | Out-of-band management (separate VLAN) |

Nodes are on a private network -- the 10.10.10.0/24 subnet is not directly
routable from the public internet.

## Known gaps and mitigations

| Gap | Risk | Mitigation |
|---|---|---|
| Self-signed TLS cert | Clients must disable verification or trust the CA manually. MITM possible if cert is not pinned. | Cert has 10-year validity with specific SANs. Production (Yucca) will use cert-manager + real CA behind haproxy. |
| Single network (public = cluster) | Cluster rebalancing traffic is visible on the client network. A compromised client could sniff inter-OSD traffic. | Trusted network firewall restricts cluster ports to RFC1918 + Tailscale. Production will separate public and cluster networks. |
| `msgr2` wire encryption not forced | Intra-cluster traffic is authenticated (cephx) but not encrypted on the wire by default. | All traffic stays within 10.10.10.0/24 on a private switch. Can be enabled via `ceph config set global ms_cluster_mode secure` if needed. |
| SSH open to all sources (dev default) | SSH is reachable from any IP that can route to the nodes. | On a private network (not internet-exposed). `MaxAuthTries=3`, `AllowUsers` whitelist. Production should set `ceph_firewall_ssh_any_source: false`. |
| `ops` password auth | Password-based SSH is not disabled. | Password is vault-encrypted, rotated via Ansible. Interactive use only -- automation uses key-only `ansible-iac`. |
| Operator SSH keys distributed out-of-band | No automated key lifecycle for `ops` user. | Acceptable for dev. Production should use centralized key management (e.g., Teleport, Vault SSH CA). |
| RGW S3 credentials static | No automatic rotation of S3 access/secret keys. | Keys stored in 1Password with access control. `radosgw-admin key create/rm` available for manual rotation. |
