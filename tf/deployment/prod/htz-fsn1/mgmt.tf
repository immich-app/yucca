# mgmt hosts — Hetzner dedicated-server reprovisioning (zack/hetzner robot API).
#
# Two-step, operator-gated flow:
#   1. Terraform arms a fresh Debian auto-install on the robot (hetzner_boot_linux),
#      authorizing a TF-owned automation SSH key for root. This is NON-destructive
#      — the flag only takes effect on the next boot; the running host is untouched.
#   2. The operator reboots the host (manually, for now) -> the robot wipes the
#      disks + installs Debian -> ansible/mgmt configures it (networkd, tailscale,
#      users from modules/identity, baseline + hardening).
#
# Only hosts listed in var.mgmt_reprovision_targets are armed, so a normal apply
# does nothing to the mgmt hosts. Re-target deliberately for each reprovision.
#
# Server numbers are the Hetzner robot IDs (GET /server). AX41-NVMe, FSN1-DC24.
locals {
  mgmt_hosts = {
    "htz-fsn-mgmt-1" = { server_number = 3008208 } # 178.63.124.40
    "htz-fsn-mgmt-2" = { server_number = 3008209 } # 178.63.124.41
  }

  site_prefix           = upper(replace(var.netbox_site_slug, "-", "_")) # HTZ_FSN1
  provisioning_key_item = "${local.site_prefix}_PROVISIONING_SSH_PRIVATE_KEY"
}

# ── Provisioning keypair (TF-owned, recorded in 1Password) ───────────────────
# Generated here, stored in the env-appropriate vault as the source-of-truth
# record, and registered in the Hetzner robot. Authorized for root on freshly-
# reprovisioned hosts; ansible/mgmt reads the private half from 1Password
# (op://<vault>/<title>/password). Survives state loss and is operator-visible.
resource "tls_private_key" "mgmt_provisioning" {
  algorithm = "ED25519"
}

data "onepassword_vault" "env" {
  name = var.op_vault
}

resource "onepassword_item" "mgmt_provisioning_key" {
  vault    = data.onepassword_vault.env.uuid
  title    = local.provisioning_key_item
  category = "password"
  password = tls_private_key.mgmt_provisioning.private_key_openssh

  section {
    label = "keypair"
    field {
      label = "public_key"
      type  = "STRING"
      value = trimspace(tls_private_key.mgmt_provisioning.public_key_openssh)
    }
  }
}

resource "hetzner_ssh_key" "mgmt_automation" {
  name = "${local.site_prefix}-provisioning"
  data = trimspace(tls_private_key.mgmt_provisioning.public_key_openssh)
}

# ── Arm a fresh OS install for each targeted host ────────────────────────────
# server_number RequiresReplace, so re-targeting recreates cleanly.
resource "hetzner_boot_linux" "mgmt" {
  for_each = toset(var.mgmt_reprovision_targets)

  server_number  = local.mgmt_hosts[each.key].server_number
  dist           = var.mgmt_dist
  lang           = "en"
  arch           = 64
  authorized_key = hetzner_ssh_key.mgmt_automation.fingerprint
}
