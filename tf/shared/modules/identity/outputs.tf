output "users" {
  description = "Raw user registry (username -> identity + group memberships). For server provisioning."
  value       = var.users
}

output "groups" {
  description = "Raw group definitions."
  value       = var.groups
}

output "server_authorized_keys" {
  description = "Union of SSH public keys (ed25519 + rsa) for members of any group with a `server` mapping. For populating a shared node ops account's authorized_keys."
  value = sort(distinct(flatten([
    for uname, u in var.users : concat(u.ssh_ed25519_keys, u.ssh_rsa_keys)
    if length([for g in u.groups : g if try(var.groups[g].server, null) != null]) > 0
  ])))
}

output "members_of" {
  description = "Group name -> sorted member usernames. Lets a consumer (e.g. servers) provision a group's people."
  value = {
    for g in keys(var.groups) : g => sort([
      for uname, u in var.users : uname if contains(u.groups, g)
    ])
  }
}

output "fabric_login" {
  description = "Inputs for the fabric-login module: per-member login class + the custom classes to define. Only members of fabric-mapped groups are included."
  value = {
    users   = local.fabric_login_users
    classes = local.fabric_synth_classes
  }

  precondition {
    condition     = length(local.unknown_memberships) == 0
    error_message = "Users reference unknown groups: ${join(", ", local.unknown_memberships)}."
  }
  precondition {
    condition = alltrue([
      for uname, r in local.fabric_resolved :
      length(r.builtins) <= 1 || contains(r.builtins, "super-user")
    ])
    error_message = "A user is in multiple conflicting built-in fabric classes (none being super-user); cannot pick one login class."
  }
}
