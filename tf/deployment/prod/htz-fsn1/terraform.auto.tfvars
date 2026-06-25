site_id    = 40
site_code  = "FSN1"
netbox_url = "https://netbox.futoinfra.com"

# Login users applied to every switch VC. Public keys only — NOT secret.
# `class` is the rights: a built-in (super-user, operator, read-only) or a custom
# one defined in fabric_login_classes below.
fabric_users = {
  terraform = {
    class            = "super-user"
    uid              = 2000
    ssh_ed25519_keys = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBGZtF1f+06DCKqdFYnCOn6idd1RBFqzTq7CdwluNVLc yucca-junos-tf"]
  }

  # Example operator with restricted rights (uncomment + add real key):
  # ops = {
  #   class            = "fabric-ro"
  #   ssh_ed25519_keys = ["ssh-ed25519 AAAA... alice@futo"]
  # }
}

# Custom login classes (rights). Example: a read-only class for operators.
fabric_login_classes = {
  # fabric-ro = { permissions = ["view", "view-configuration"] }
}

# cls1 (cls1netsw) leaf VC member serials.
cls1_leaf_serials = ["XH4925470753", "XH4925460012"]

# spine (corenetsw) VC member serials.
spine_vc_serials = ["WH3622440738", "WH0220510012"]
