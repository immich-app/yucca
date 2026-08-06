# 1P auth via OP_SERVICE_ACCOUNT_TOKEN (CI: OP_TF_YUCCA_STAGING_ENV_WRITE;
# local: superuser SA). Stack-level so dev/ceph never pulls in the 1P provider.
#
# NOT created here, by design:
#   - S3 svc-user keys (<CLUSTER>_CEPH_S3_SVC_YUCCA_RESTIC_{ACCESS,SECRET}_KEY):
#     out-of-band stable contract — the rebuilt RGW is seeded from the same
#     items; recreating them here would collide and churn a live contract.
#   - SSH Key item (<CLUSTER>_CEPH_ANSIBLE_IAC_SSH_KEY): op CLI --ssh-generate-key
#     (provider can't generate; import would put the private key in state).
#   - DR Document items (RGW TLS cert/key, admin keyring): `mise run capture`.

locals {
  # Out-of-band roles (see header).
  ceph_unmanaged_secret_roles = ["s3_restic_access", "s3_restic_secret"]

  # ops = break-glass, typed at the KVM → short; metrics-worker keys follow the
  # AWS/RGW shape (20-char id, 40-char secret); others default.
  ceph_password_length = {
    ops                   = 16
    metrics_worker_access = 20
    metrics_worker_secret = 40
  }
  ceph_password_default_length = 32

  ceph_secret_items = merge([
    for cname, c in var.clusters : {
      for role, title in module.cluster[cname].secrets :
      "${cname}.${role}" => {
        vault  = coalesce(c.vault, "Yucca")
        title  = title
        length = lookup(local.ceph_password_length, role, local.ceph_password_default_length)
      }
      if !contains(local.ceph_unmanaged_secret_roles, role)
    }
  ]...)
}

data "onepassword_vault" "target" {
  for_each = toset([for c in var.clusters : coalesce(c.vault, "Yucca")])
  name     = each.value
}

resource "onepassword_item" "ceph_password" {
  for_each = local.ceph_secret_items

  vault    = data.onepassword_vault.target[each.value.vault].uuid
  title    = each.value.title
  category = "password"

  password_recipe {
    length  = each.value.length
    letters = true
    digits  = true
    symbols = false
  }

  lifecycle {
    # Recipe applies only at creation; rotation is an explicit taint/op edit.
    # Length changes affect only freshly-created items.
    ignore_changes = [password_recipe]
  }
}
