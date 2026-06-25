# Runbook: Rotate RGW TLS Certificates

**When:** Certificate approaching expiry, compromised key material, or SAN
changes (new nodes added, DNS name changed).

**Time estimate:** 5 minutes. Brief RGW restart causes ~10s S3 downtime.

**Prerequisites:**
- `op` session live (desktop unlocked or `OP_SERVICE_ACCOUNT_TOKEN` set)
- Cluster is healthy

---

## 1. Check current certificate expiry

```bash
ssh ansible-iac@sietch-ceph-laurel
sudo openssl x509 -in /etc/ceph/rgw-ssl.crt -noout -subject -dates -ext subjectAltName
```

Output shows:

```
subject=C = US, ST = Texas, L = Austin, O = FUTO, CN = s3.dev.austin.int.futo.cloud
notBefore=...
notAfter=...
X509v3 Subject Alternative Name:
    DNS:s3.dev.austin.int.futo.cloud, DNS:*.s3.dev.austin.int.futo.cloud, ...
```

## 2. Run the rotation playbook

```bash
scripts/ansible-play.sh rotate-certs.yml
```

### What this does

1. **Deletes** `/etc/ceph/rgw-ssl.crt` and `/etc/ceph/rgw-ssl.key` on the
   bootstrap node
2. **Re-runs the RGW role** (`roles/ceph_deploy/tasks/rgw.yml`) which:
   - Generates a new 4096-bit RSA self-signed cert with 10-year validity
   - SANs include: the canonical DNS name, wildcard for virtual-hosted
     buckets, per-node FQDNs, and per-node bond IPs
   - Renders the RGW service spec with the new cert embedded
   - Applies the service spec via `ceph orch apply` -- cephadm distributes
     the cert to all RGW daemon containers
3. **Restarts all RGW daemons** via `ceph orch restart rgw` to load the
   new cert
4. **Displays** the new certificate subject, dates, and SANs

### Impact

- RGW daemons restart sequentially. S3 requests will fail for ~10 seconds
  during the restart window.
- Clients using the old self-signed cert in their trust store will need the
  new cert. Export with:

```bash
ssh ansible-iac@sietch-ceph-laurel sudo cat /etc/ceph/rgw-ssl.crt
```

## 3. Verify after rotation

### Check new cert details

The playbook prints this, but to verify manually:

```bash
ssh ansible-iac@sietch-ceph-laurel
sudo openssl x509 -in /etc/ceph/rgw-ssl.crt -noout -subject -dates -ext subjectAltName
```

### Test RGW endpoint

```bash
# From a node in the cluster (self-signed cert)
curl -k https://s3.dev.austin.int.futo.cloud:443/
```

Expected: XML response with `ListAllMyBucketsResult` or `AccessDenied`
(both mean RGW is serving TLS correctly).

### Test direct node access

```bash
curl -k https://10.10.10.90:443/
```

### Check RGW daemons are running

```bash
ceph orch ls --service-type rgw
```

Expected: running count matches the number of ceph_nodes (currently 3).

### Check dashboard can reach RGW

Open `https://<bootstrap-ip>:8443` and navigate to Object Gateway.
The page should load without 500 errors (dashboard has RGW API SSL
verification disabled for self-signed certs).

## Certificate configuration

The cert parameters are controlled by these variables in
`inventories/sietch-ceph.staging.austin.int/group_vars/all/vars.yml`:

| Variable | Default | Purpose |
|---|---|---|
| `ceph_rgw_ssl` | `true` | Enable TLS on RGW frontend |
| `ceph_rgw_ssl_cert_days` | `3650` | Validity period (10 years) |
| `ceph_rgw_ssl_cert_subject_c` | `US` | Country |
| `ceph_rgw_ssl_cert_subject_st` | `Texas` | State |
| `ceph_rgw_ssl_cert_subject_l` | `Austin` | Locality |
| `ceph_rgw_ssl_cert_subject_o` | `FUTO` | Organization |
| `ceph_rgw_ssl_cert_email` | `yucca@futo.org` | Contact email |
| `ceph_rgw_dns_name` | `s3.dev.austin.int.futo.cloud` | CN and primary SAN |

SANs are auto-generated from inventory: per-node FQDNs and bond IPs are
included so direct-host access validates.
