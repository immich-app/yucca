site_id    = 40
site_code  = "FSN1"
netbox_url = "https://netbox.futoinfra.com"

# Login users/groups now live in the central registry: shared/modules/identity.
# Add people + their SSH keys + group memberships there; fabric-mapped groups
# (e.g. fabric-admins) become login users on every VC automatically.

# cls1 (cls1netsw) leaf VC member serials.
cls1_leaf_serials = ["XH4925470753", "XH4925460012"]

# spine (corenetsw) VC member serials.
spine_vc_serials = ["WH3622440738", "WH0220510012"]
