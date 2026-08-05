# Junos login users + classes (+ name-servers, so one resource owns the `system`
# slice). Public SSH keys are committed; passwords never are.
locals {
  user_keys = {
    for name, u in var.users : name => concat(u.ssh_ed25519_keys, u.ssh_rsa_keys)
  }
}

resource "junos_system_login_class" "this" {
  for_each    = var.classes
  name        = each.key
  permissions = each.value.permissions
}

resource "junos_system_login_user" "this" {
  for_each  = var.users
  name      = each.key
  class     = each.value.class
  uid       = each.value.uid
  full_name = each.value.full_name

  dynamic "authentication" {
    for_each = length(local.user_keys[each.key]) > 0 || each.value.encrypted_password != null ? [1] : []
    content {
      ssh_public_keys    = length(local.user_keys[each.key]) > 0 ? local.user_keys[each.key] : null
      encrypted_password = each.value.encrypted_password
    }
  }

  # A user's class may be one of the synthesized custom classes.
  depends_on = [junos_system_login_class.this]
}

# Resolvers via additive raw set-config, NOT junos_system: that singleton owns
# the whole `system` block, so setting only name-server would STRIP netconf/ssh
# and lock us out. Trade-off: removing a resolver needs a manual delete.
resource "junos_null_load_config" "name_servers" {
  count  = length(var.name_servers) == 0 ? 0 : 1
  action = "set"
  config = join("\n", [for ns in var.name_servers : "set system name-server ${ns}"])
}
