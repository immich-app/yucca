# Two-step, operator-gated: TF only ARMS the auto-install (non-destructive until
# the operator reboots → robot wipes+installs → ansible/mgmt configures). Only
# var.mgmt_reprovision_targets are armed, so a normal apply touches nothing.
# ../mgmt-hosts.yaml is the same SoT as the ansible inventory render.
locals {
  mgmt_roster = yamldecode(file("${path.module}/../mgmt-hosts.yaml"))
  mgmt_hosts  = local.mgmt_roster.hosts

  site_prefix           = upper(replace(var.netbox_site_slug, "-", "_")) # HTZ_FSN1
  provisioning_key_item = "${local.site_prefix}_PROVISIONING_SSH_PRIVATE_KEY"
}

resource "terraform_data" "mgmt_site_id_check" {
  lifecycle {
    precondition {
      condition     = local.mgmt_roster.site_id == var.site_id
      error_message = "mgmt-hosts.yaml site_id (${local.mgmt_roster.site_id}) != var.site_id (${var.site_id})."
    }
  }
}

# 1P record = source of truth; registered in Robot, authorized for root on
# reprovisioned hosts; ansible/mgmt reads op://<vault>/<title>/password.
resource "tls_private_key" "mgmt_provisioning" {
  algorithm = "ED25519"

  lifecycle {
    # Rotation = re-register in Robot + re-authorize hosts — a deliberate
    # runbook, never a plan side effect.
    prevent_destroy = true
  }
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

# server_number RequiresReplace, so re-targeting recreates cleanly.
resource "hetzner_boot_linux" "mgmt" {
  for_each = toset(var.mgmt_reprovision_targets)

  server_number  = local.mgmt_hosts[each.key].server_number
  dist           = var.mgmt_dist
  lang           = "en"
  arch           = 64
  authorized_key = hetzner_ssh_key.mgmt_automation.fingerprint
}
