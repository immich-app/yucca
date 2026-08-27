# fabric-login — declaratively manage Junos login users + their SSH keys and
# rights on a switch VC. Public keys are NOT secret and live in version control;
# any passwords come from variables sourced from 1Password (never committed).
# Instantiated once per VC with that VC's aliased junos provider.

variable "users" {
  description = "Login users keyed by username. Public SSH keys are committed; rights via `class`."
  type = map(object({
    class            = string # login class (built-in like super-user, or one from `classes`)
    uid              = optional(number)
    full_name        = optional(string)
    ssh_ed25519_keys = optional(list(string), []) # full "ssh-ed25519 AAAA... comment" strings
    ssh_rsa_keys     = optional(list(string), []) # full "ssh-rsa AAAA... comment" strings
    # sha512-crypt ($6$...) hash, for tools that can't key-auth (e.g. the looking
    # glass). Source it from 1Password via a TF var — never commit even the hash.
    encrypted_password = optional(string)
  }))

  # Junos aliases same-uid logins into ONE user: whoever authenticates gets the
  # merged user's class, so a collision silently reassigns rights (a super-user
  # key landing in a read-only class, as happened with nutgood/netops both at
  # uid 3000).
  validation {
    condition     = length(distinct([for u in var.users : u.uid if u.uid != null])) == length([for u in var.users : u.uid if u.uid != null])
    error_message = "Duplicate uid across login users: Junos treats same-uid logins as one user and silently merges their classes/keys. Give every user a unique uid."
  }
}

variable "classes" {
  description = "Optional custom login classes -> their permission set (rights)."
  type = map(object({
    permissions = list(string)
  }))
  default = {}
}

variable "name_servers" {
  type        = list(string)
  default     = []
  description = "Default DNS resolvers (system name-server). Empty = unset. Lives here (not core-fabric) so the whole `system` container is owned by one resource."
}
