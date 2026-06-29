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
  }))
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
