locals {
  # Build each user, including only the sub-blocks that have content (the JTAF
  # schema expects lists; empty key-type blocks are omitted via merge()).
  users = [
    for name, u in var.users : merge(
      {
        name  = name
        class = u.class
        authentication = [
          merge(
            length(u.ssh_ed25519_keys) == 0 ? {} : { ssh_ed25519 = [for k in u.ssh_ed25519_keys : { name = k }] },
            length(u.ssh_rsa_keys) == 0 ? {} : { ssh_rsa = [for k in u.ssh_rsa_keys : { name = k }] },
          )
        ]
      },
      u.uid == null ? {} : { uid = u.uid },
      u.full_name == null ? {} : { full_name = u.full_name },
    )
  ]

  classes = [for name, c in var.classes : { name = name, permissions = c.permissions }]

  login = [
    merge(
      { user = local.users },
      length(local.classes) == 0 ? {} : { class = local.classes },
    )
  ]
}

resource "terraform-provider-junos-qfx" "login" {
  resource_name = var.resource_name
  provider      = junos-qfx

  # This resource owns the whole `system` container slice: login + name-servers.
  # Splitting `system` children across resources makes each one delete the other's
  # (the provider diffs its managed slice against the live device).
  system = [
    merge(
      { login = local.login },
      length(var.name_servers) == 0 ? {} : { name_server = [for ns in var.name_servers : { name = ns }] },
    )
  ]
}
