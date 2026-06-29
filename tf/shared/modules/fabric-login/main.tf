# Declaratively manage Junos login users + classes (and the default name-servers,
# which live here so a single resource owns the `system` slice). One resource per
# user/class. Public SSH keys are committed; passwords never are.
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
    for_each = length(local.user_keys[each.key]) > 0 ? [1] : []
    content {
      ssh_public_keys = local.user_keys[each.key]
    }
  }

  # A user's class may be one of the synthesized custom classes.
  depends_on = [junos_system_login_class.this]
}

# Default DNS resolvers, pushed as additive raw set-config. NOT junos_system: that
# is a singleton owning the whole `system` block (incl. `services netconf/ssh` and
# `ssh root-login`), so setting only name-server would STRIP the management services
# and lock us out. null_load_config only ever `set`s — it cannot remove services.
# (Trade-off: removing a resolver later needs a manual delete; fine for DNS.)
resource "junos_null_load_config" "name_servers" {
  count  = length(var.name_servers) == 0 ? 0 : 1
  action = "set"
  config = join("\n", [for ns in var.name_servers : "set system name-server ${ns}"])
}
