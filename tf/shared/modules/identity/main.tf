locals {
  # Membership integrity: every group a user references must exist.
  unknown_memberships = flatten([
    for uname, u in var.users : [
      for g in u.groups : "${uname} -> ${g}" if !contains(keys(var.groups), g)
    ]
  ])

  # Groups that grant any fabric access, by name -> their fabric mapping.
  fabric_groups = { for g, v in var.groups : g => v.fabric if v.fabric != null }

  # Each user's fabric-relevant groups (membership ∩ fabric-mapped groups).
  fabric_member_groups = {
    for uname, u in var.users :
    uname => [for g in u.groups : g if contains(keys(local.fabric_groups), g)]
  }
  # Only users actually granted fabric access.
  fabric_members = {
    for uname, gs in local.fabric_member_groups : uname => gs if length(gs) > 0
  }

  # Resolve each member's built-in classes + merged custom permissions.
  fabric_resolved = {
    for uname, gs in local.fabric_members : uname => {
      builtins = distinct([for g in gs : local.fabric_groups[g].class if local.fabric_groups[g].class != null])
      perms    = distinct(flatten([for g in gs : local.fabric_groups[g].permissions if local.fabric_groups[g].permissions != null]))
    }
  }

  # Effective single Junos login class per member. A built-in class wins over a
  # synthesized permission set (super-user already implies everything); otherwise
  # the member gets a class named after them holding the union of group perms.
  fabric_member_class = {
    for uname, r in local.fabric_resolved :
    uname => length(r.builtins) > 0 ? (contains(r.builtins, "super-user") ? "super-user" : r.builtins[0]) : uname
  }

  # Custom classes to define on the switches: one per member resolving to perms.
  fabric_synth_classes = {
    for uname, r in local.fabric_resolved :
    uname => { permissions = r.perms } if length(r.builtins) == 0
  }

  # Shape expected by the fabric-login module.
  fabric_login_users = {
    for uname in keys(local.fabric_members) :
    uname => {
      class            = local.fabric_member_class[uname]
      uid              = var.users[uname].uid
      full_name        = var.users[uname].full_name
      ssh_ed25519_keys = var.users[uname].ssh_ed25519_keys
      ssh_rsa_keys     = var.users[uname].ssh_rsa_keys
    }
  }
}
