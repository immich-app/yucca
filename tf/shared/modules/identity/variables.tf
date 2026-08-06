# The canonical registry: data lives in the defaults so every stack gets the same
# users/groups with no inputs. Public SSH keys are NOT secret and are committed;
# secrets never live here.

variable "users" {
  description = "Users keyed by username: identity + group memberships + public SSH keys. Edit here to add/remove people."
  type = map(object({
    full_name        = optional(string)
    uid              = optional(number)
    groups           = optional(list(string), []) # group memberships; rights are derived from these
    ssh_ed25519_keys = optional(list(string), []) # full "ssh-ed25519 AAAA... comment" strings
    ssh_rsa_keys     = optional(list(string), []) # full "ssh-rsa AAAA... comment" strings
  }))

  default = {
    terraform = {
      full_name        = "Terraform fabric automation"
      uid              = 2000
      groups           = ["fabric_admins"]
      ssh_ed25519_keys = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBGZtF1f+06DCKqdFYnCOn6idd1RBFqzTq7CdwluNVLc yucca-junos-tf"]
    }
    nutgood = {
      full_name = "Antoine"
      uid       = 3000
      groups    = ["fabric_admins", "server_admins"]
      ssh_ed25519_keys = [
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOaH71qha6kLO2qRu+w6C5wPpWhkiBjEUeY1fAjAVApR"
      ]
    }
    andy = {
      full_name = "Andy"
      uid       = 3001
      groups    = ["fabric_viewer", "server_admins"]
      ssh_ed25519_keys = [
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO7XdW03gJKyABt5KCMxOLPb5sOGTXuZV0OHc1Ro46Nt andy@futo.org"
      ]
    }
  }
}

variable "groups" {
  description = "Groups keyed by name. A group carries per-system role mappings; `fabric` grants switch-fabric rights, `server` grants login access to provisioned servers (their members' SSH keys flow to the node ops account)."
  type = map(object({
    description = optional(string)
    #   class       — a built-in Junos login class (e.g. super-user); takes precedence.
    #   permissions — a custom set, merged across a member's fabric groups.
    fabric = optional(object({
      class       = optional(string)
      permissions = optional(list(string))
    }))
    # Presence grants login access; members' SSH keys populate the shared node ops
    # account's authorized_keys. `sudo` is reserved for per-user accounts if/when
    # those are wired up.
    server = optional(object({
      sudo = optional(string)
    }))
  }))

  default = {
    fabric_admins = {
      description = "Full administrative access to the switch fabric."
      fabric      = { class = "super-user" }
    }
    fabric_viewer = {
      description = "Read-only access to the switch fabric."
      fabric      = { class = "read-only" }
    }
    server_admins = {
      description = "Login access to provisioned servers (e.g. the ceph nodes)."
      # NOPASSWD: these accounts authenticate by SSH key only and have no local
      # passwords to type; passworded sudo just blocks remote automation.
      server = { sudo = "NOPASSWD:ALL" }
    }
  }

  validation {
    condition = alltrue([
      for g, v in var.groups : v.fabric == null ? true :
      (v.fabric.class != null) != (v.fabric.permissions != null)
    ])
    error_message = "Each group's `fabric` mapping must set exactly one of `class` or `permissions`."
  }
}
